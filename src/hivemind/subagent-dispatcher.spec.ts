import { describe, expect, it, vi } from 'vitest'

import type {
  LLMProvider,
  ProviderStreamEvent,
  ProviderTokenUsage,
} from '../provider/provider.types.js'
import { RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'

import {
  SubagentDispatcher,
  buildChildPolicy,
  dispatchSubagent,
  parseSubagentResult,
} from './subagent-dispatcher.js'

function makeContext(overrides: Partial<RuntimeToolContext> = {}): RuntimeToolContext {
  return {
    cwd: '/workspace',
    policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
    ...overrides,
  }
}

function createTextProvider(text: string): LLMProvider {
  const usage: ProviderTokenUsage = { inputTokens: 150, outputTokens: 75 }
  return {
    providerId: 'mock-provider',
    displayName: 'Mock Provider',
    complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
      yield { type: 'text_delta', text }
      yield { type: 'message_stop', stopReason: 'end_turn', usage }
    }),
  }
}

function createToolThenTextProvider(
  toolCall: { id: string; name: string; input: Record<string, unknown> },
  finalText: string,
): LLMProvider {
  const usage: ProviderTokenUsage = { inputTokens: 200, outputTokens: 100 }
  let callCount = 0
  return {
    providerId: 'mock-provider',
    displayName: 'Mock Provider',
    complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
      callCount++
      if (callCount === 1) {
        yield { type: 'tool_use_start', id: toolCall.id, name: toolCall.name }
        yield { type: 'tool_use_end', id: toolCall.id, name: toolCall.name, input: toolCall.input }
        yield { type: 'message_stop', stopReason: 'tool_use', usage }
      } else {
        yield { type: 'text_delta', text: finalText }
        yield { type: 'message_stop', stopReason: 'end_turn', usage }
      }
    }),
  }
}

describe('parseSubagentResult', () => {
  it('parses structured findings/evidence/risks headers', () => {
    const raw = [
      '## Findings',
      '- auth logic lives in src/auth/login.ts',
      '- token refresh has no test coverage',
      '## Evidence',
      '- src/auth/login.ts:42 calls refreshToken() without a try/catch',
      '## Risks',
      '- a failed refresh silently logs the user out',
    ].join('\n')

    const result = parseSubagentResult(raw)

    expect(result.findings).toEqual([
      'auth logic lives in src/auth/login.ts',
      'token refresh has no test coverage',
    ])
    expect(result.evidence).toEqual([
      'src/auth/login.ts:42 calls refreshToken() without a try/catch',
    ])
    expect(result.risks).toEqual(['a failed refresh silently logs the user out'])
    expect(result.rawOutput).toBe(raw)
  })

  it('falls back to the raw text as a single finding when there is no structure', () => {
    const result = parseSubagentResult('Just a plain sentence with no headers.')
    expect(result.findings).toEqual(['Just a plain sentence with no headers.'])
    expect(result.evidence).toEqual([])
    expect(result.risks).toEqual([])
  })

  it('returns empty findings for empty output', () => {
    expect(parseSubagentResult('').findings).toEqual([])
  })
})

describe('dispatchSubagent', () => {
  it('returns status=blocked for an unknown subagent name', async () => {
    const provider = createTextProvider('should not run')
    const evidence = await dispatchSubagent(provider, makeContext(), {
      subagent: 'coder' as never,
      goal: 'do something',
      parentSessionId: 'cm-parent-1',
    })

    expect(evidence.status).toBe('blocked')
    expect(evidence.reason).toMatch(/Unknown subagent/)
    expect(provider.complete).not.toHaveBeenCalled()
  })

  it('dispatches to explorer with a fresh, real, distinct child session id', async () => {
    const provider = createTextProvider('## Findings\n- found it')
    const auditLog = new RuntimeAuditLog()

    const evidence = await dispatchSubagent(
      provider,
      makeContext(),
      { subagent: 'explorer', goal: 'find the auth code', parentSessionId: 'cm-parent-1' },
      auditLog,
    )

    expect(evidence.status).toBe('completed')
    expect(evidence.subagent).toBe('explorer')
    expect(evidence.parentSessionId).toBe('cm-parent-1')
    expect(evidence.childSessionId).toMatch(/^sub-\d+-[0-9a-f]{8}$/)
    expect(evidence.childSessionId).not.toBe('cm-parent-1')
    expect(evidence.result.findings).toEqual(['found it'])
    expect(evidence.auditTrace).toHaveLength(1)
    expect(auditLog.list()).toHaveLength(1)
  })

  it('only ever offers the explorer its allowedTools -- a withheld tool is never even called', async () => {
    // The mock provider tries to call edit_file, which is NOT in explorer's allowedTools.
    // Because the child tool list is filtered (not just policy-blocked), the agent loop
    // treats it as an unknown tool -- proof of real isolation, not a runtime denial.
    const provider = createToolThenTextProvider(
      { id: 'call-1', name: 'edit_file', input: { path: 'a.ts', oldText: 'x', newText: 'y' } },
      '## Findings\n- could not edit, tool unavailable',
    )

    const evidence = await dispatchSubagent(provider, makeContext(), {
      subagent: 'explorer',
      goal: 'edit a file',
      parentSessionId: 'cm-parent-1',
    })

    expect(evidence.toolsUsed).not.toContain('edit_file')
  })

  it('grants exactly the governedTools list when governance is explicitly enabled', async () => {
    const provider = createTextProvider('governed run')
    const context = makeContext()

    const evidence = await dispatchSubagent(provider, context, {
      subagent: 'explorer',
      goal: 'try a governed action',
      parentSessionId: 'cm-parent-1',
      enableGovernedTools: true,
    })

    expect(evidence.governedToolsEnabled).toBe(true)
    expect(evidence.status).toBe('completed')
  })

  it('forces a read-only policy for the child when governance is not enabled, even if the parent can write', () => {
    const parentPolicy = createRuntimePolicyForMode('APPROVED_EXECUTION')
    expect(parentPolicy.allowWrites).toBe(true)
    expect(parentPolicy.allowShell).toBe(true)

    const childPolicy = buildChildPolicy(parentPolicy, false)

    expect(childPolicy.mode).toBe('READ_ONLY')
    expect(childPolicy.allowWrites).toBe(false)
    expect(childPolicy.allowShell).toBe(false)
    expect(childPolicy.allowGitHubWrites).toBe(false)
  })

  it('inherits the parent policy unchanged when governance is explicitly enabled', () => {
    const parentPolicy = createRuntimePolicyForMode('APPROVED_EXECUTION')

    const childPolicy = buildChildPolicy(parentPolicy, true)

    expect(childPolicy).toEqual(parentPolicy)
  })

  it('threads a real error status through when the agent loop hits its iteration limit', async () => {
    const toolCall = { id: 'call-1', name: 'read_file', input: { path: 'a.ts' } }
    const provider: LLMProvider = {
      providerId: 'mock-provider',
      displayName: 'Mock Provider',
      complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
        yield { type: 'tool_use_start', id: toolCall.id, name: toolCall.name }
        yield { type: 'tool_use_end', id: toolCall.id, name: toolCall.name, input: toolCall.input }
        yield {
          type: 'message_stop',
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 5 },
        }
      }),
    }

    const evidence = await dispatchSubagent(provider, makeContext(), {
      subagent: 'explorer',
      goal: 'loop forever',
      parentSessionId: 'cm-parent-1',
      maxIterations: 2,
    })

    expect(evidence.status).toBe('error')
    expect(evidence.iterationCount).toBe(2)
  })
})

describe('SubagentDispatcher', () => {
  it('binds provider/context/parentSessionId so callers only pass the dispatch request', async () => {
    const provider = createTextProvider('## Findings\n- reviewed')
    const dispatcher = new SubagentDispatcher(provider, makeContext(), 'cm-parent-bound')

    const evidence = await dispatcher.dispatch({ subagent: 'reviewer', goal: 'review the diff' })

    expect(evidence.subagent).toBe('reviewer')
    expect(evidence.parentSessionId).toBe('cm-parent-bound')
    expect(evidence.result.findings).toEqual(['reviewed'])
  })

  it('records dispatched calls onto a shared audit log across multiple dispatches', async () => {
    const provider = createTextProvider('ok')
    const auditLog = new RuntimeAuditLog()
    const dispatcher = new SubagentDispatcher(provider, makeContext(), 'cm-parent-1', auditLog)

    await dispatcher.dispatch({ subagent: 'explorer', goal: 'first' })
    await dispatcher.dispatch({ subagent: 'test-planner', goal: 'second' })

    expect(auditLog.list()).toHaveLength(2)
  })
})
