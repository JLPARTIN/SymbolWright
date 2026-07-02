import { describe, expect, it } from 'vitest'

import {
  parseSubagentRunInput,
  subagentRunTool,
  createWiredSubagentRunTool,
} from './subagent-run-tool.js'
import type { RuntimeToolContext, RuntimePolicySnapshot } from '../types.js'
import type {
  SubagentDispatchEvidence,
  SubagentDispatcher,
} from '../../hivemind/subagent-dispatcher.js'

function createTestContext(): RuntimeToolContext {
  const policy: RuntimePolicySnapshot = {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: false,
    allowReadOnlyNetwork: true,
    allowShell: true,
    allowWrites: true,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  }
  return { cwd: '/test', policy }
}

describe('parseSubagentRunInput', () => {
  it('parses valid input', () => {
    const input = { subagent: 'explorer', goal: 'find the auth code' }
    const parsed = parseSubagentRunInput(input)

    expect(parsed.subagent).toBe('explorer')
    expect(parsed.goal).toBe('find the auth code')
  })

  it('parses input with enableGovernedTools', () => {
    const input = { subagent: 'test-planner', goal: 'plan tests', enableGovernedTools: true }
    const parsed = parseSubagentRunInput(input)

    expect(parsed.enableGovernedTools).toBe(true)
  })

  it('rejects null input', () => {
    expect(() => parseSubagentRunInput(null)).toThrow('Missing input')
  })

  it('rejects missing subagent', () => {
    expect(() => parseSubagentRunInput({ goal: 'test' })).toThrow('Missing subagent')
  })

  it('rejects invalid subagent name', () => {
    expect(() => parseSubagentRunInput({ subagent: 'coder', goal: 'test' })).toThrow(
      'Invalid subagent',
    )
  })

  it('rejects empty goal', () => {
    expect(() => parseSubagentRunInput({ subagent: 'explorer', goal: '' })).toThrow(
      'Missing or empty goal',
    )
  })
})

describe('subagentRunTool (static fallback)', () => {
  it('returns QUEUED status', async () => {
    const result = await subagentRunTool.execute(
      { subagent: 'explorer', goal: 'find auth code' },
      createTestContext(),
    )

    expect(result).toContain('QUEUED')
    expect(result).toContain('explorer')
  })
})

describe('createWiredSubagentRunTool', () => {
  it('dispatches through the provided dispatcher and renders structured evidence', async () => {
    const mockEvidence: SubagentDispatchEvidence = {
      tool: 'subagent_run',
      subagent: 'explorer',
      status: 'completed',
      parentSessionId: 'cm-parent-1',
      childSessionId: 'sub-123-abcdef01',
      governedToolsEnabled: false,
      toolsUsed: ['read_file'],
      iterationCount: 2,
      tokenUsage: { inputTokens: 100, outputTokens: 50 },
      result: {
        findings: ['auth logic lives in src/auth/login.ts'],
        evidence: ['src/auth/login.ts:42'],
        risks: ['none'],
        rawOutput: '## Findings\n- auth logic lives in src/auth/login.ts',
      },
      durationMs: 500,
      auditTrace: [],
    }

    const mockDispatcher = {
      dispatch: async () => mockEvidence,
    } as unknown as SubagentDispatcher

    const collectedResults: SubagentDispatchEvidence[] = []
    const wiredTool = createWiredSubagentRunTool(mockDispatcher, (r) => collectedResults.push(r))

    const result = await wiredTool.execute(
      { subagent: 'explorer', goal: 'find the auth code' },
      createTestContext(),
    )

    expect(result).toContain('sub-123-abcdef01')
    expect(result).toContain('COMPLETED')
    expect(result).toContain('auth logic lives in src/auth/login.ts')
    expect(result).toContain('src/auth/login.ts:42')
    expect(collectedResults).toHaveLength(1)
    expect(collectedResults[0]?.childSessionId).toBe('sub-123-abcdef01')
  })

  it('has the correct tool name', () => {
    const mockDispatcher = {
      dispatch: async () => ({}),
    } as unknown as SubagentDispatcher

    const wiredTool = createWiredSubagentRunTool(mockDispatcher)
    expect(wiredTool.name).toBe('subagent_run')
  })
})
