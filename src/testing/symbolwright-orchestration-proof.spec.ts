import { describe, expect, it, vi } from 'vitest'

import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import type {
  RuntimePolicySnapshot,
  RuntimeToolContext,
  RuntimeToolDefinition,
} from '../runtime/types.js'
import {
  activateSubsystems,
  verifySubsystemHealth,
  renderSubsystemHealthReport,
} from '../activation/symbolwright-activation.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { bridgeToolsForProvider, extractProviderTools } from '../agent/tool-schema-bridge.js'
import { createRuntimeSession } from '../runtime/session/runtime-session.js'
import {
  appendTranscriptEntry,
  renderRuntimeTranscript,
} from '../runtime/transcript/runtime-transcript.js'
import {
  RuntimeAuditLog,
  createAuditEvent,
  renderAuditEvents,
} from '../runtime/audit/runtime-audit-log.js'
import { classifyError, formatErrorForUser } from '../runtime/error-handling/error-handler.js'
import { assertValidPolicy, createDefaultRuntimePolicy } from '../runtime/policy/runtime-policy.js'

function createMockProvider(): LLMProvider {
  return {
    providerId: 'mock-provider',
    displayName: 'Mock Provider',
    complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
      yield { type: 'text_delta', text: 'Hello' }
      yield {
        type: 'message_stop',
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    }),
  }
}

function createTestTools(): RuntimeToolDefinition[] {
  return [
    {
      name: 'read_file',
      description: 'Read',
      capability: 'READ',
      execute: vi.fn().mockResolvedValue('ok'),
    },
    {
      name: 'search_files',
      description: 'Search',
      capability: 'SEARCH',
      execute: vi.fn().mockResolvedValue('ok'),
    },
  ]
}

function createTestContext(): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: {
      mode: 'READ_ONLY',
      allowNetwork: false,
      allowReadOnlyNetwork: true,
      allowShell: false,
      allowWrites: false,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: [],
    },
  }
}

describe('Activation pipeline proof', () => {
  it('activateSubsystems → verifySubsystemHealth → renderSubsystemHealthReport produces valid output', () => {
    const subsystems = activateSubsystems({
      provider: createMockProvider(),
      tools: createTestTools(),
      toolContext: createTestContext(),
    })

    const report = verifySubsystemHealth(subsystems)
    expect(report.healthy).toBe(true)

    const output = renderSubsystemHealthReport(report)
    expect(output).toContain('Subsystem Health Report')
    expect(output).toContain('[PASS]')
    expect(output).toContain('HEALTHY')
    expect(output.length).toBeGreaterThan(0)
  })
})

describe('Tool assembly pipeline proof', () => {
  it('assembleAgentTools → bridgeToolsForProvider → extractProviderTools chain produces valid schemas', () => {
    const tools = assembleAgentTools()
    expect(tools.length).toBeGreaterThan(0)

    const policy: RuntimePolicySnapshot = {
      mode: 'APPROVED_EXECUTION',
      allowNetwork: false,
      allowReadOnlyNetwork: true,
      allowShell: false,
      allowWrites: false,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: [],
    }

    const bridged = bridgeToolsForProvider(tools, policy)
    expect(bridged.length).toBeGreaterThan(0)

    for (const bt of bridged) {
      expect(bt.providerTool.name).toBeTruthy()
      expect(bt.providerTool.inputSchema).toBeDefined()
      expect(bt.providerTool.inputSchema.type).toBe('object')
    }

    const providerTools = extractProviderTools(bridged)
    expect(providerTools.length).toBe(bridged.length)
  })
})

describe('Session lifecycle proof', () => {
  it('createRuntimeSession → appendTranscriptEntry → renderRuntimeTranscript chain is well-formed', () => {
    const session = createRuntimeSession('Analyze the project structure')

    let transcript = session.transcript
    transcript = appendTranscriptEntry(transcript, {
      iteration: 1,
      role: 'system',
      message: 'Starting analysis',
    })
    transcript = appendTranscriptEntry(transcript, {
      iteration: 2,
      role: 'tool',
      message: 'Reading src/',
    })
    transcript = appendTranscriptEntry(transcript, {
      iteration: 3,
      role: 'result',
      message: 'Found 42 files',
    })

    expect(transcript.entries).toHaveLength(3)

    const output = renderRuntimeTranscript(transcript)
    expect(output).toContain('Runtime transcript')
    expect(output).toContain('Goal: Analyze the project structure')
    expect(output).toContain('[1] SYSTEM: Starting analysis')
    expect(output).toContain('[2] TOOL: Reading src/')
    expect(output).toContain('[3] RESULT: Found 42 files')
  })
})

describe('Audit chain proof', () => {
  it('RuntimeAuditLog.record → list → renderAuditEvents includes all events with timestamps', () => {
    const log = new RuntimeAuditLog()

    log.record(
      createAuditEvent({ action: 'read_file', status: 'allowed', detail: 'Read README.md' }),
    )
    log.record(createAuditEvent({ action: 'write_file', status: 'blocked', detail: 'No approval' }))
    log.record(
      createAuditEvent({
        action: 'apply_edit',
        status: 'allowed',
        detail: 'Applied patch',
        approval: { ticketId: 'T-1', approvedBy: 'operator', scopes: ['apply_edit'] },
      }),
    )

    const events = log.list()
    expect(events).toHaveLength(3)

    for (const event of events) {
      expect(event.timestamp).toBeDefined()
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp)
    }

    const output = renderAuditEvents(events)
    expect(output).toContain('ALLOWED read_file')
    expect(output).toContain('BLOCKED write_file')
    expect(output).toContain('ALLOWED apply_edit')
    expect(output).toContain('Runtime audit log')
  })
})

describe('Error classification proof', () => {
  it('classifies and formats errors for each category', () => {
    const errorCases = [
      { error: new Error('API key invalid'), expectedCategory: 'provider_error' },
      { error: new Error('Rate limit exceeded (429)'), expectedCategory: 'provider_error' },
      { error: new Error('Server overloaded (503)'), expectedCategory: 'provider_error' },
      { error: new Error('Connection timeout ETIMEDOUT'), expectedCategory: 'network_error' },
      {
        error: new Error('Permission denied for this action'),
        expectedCategory: 'permission_denied',
      },
      {
        error: new Error('Context overflow: message too long'),
        expectedCategory: 'context_overflow',
      },
      { error: new Error('Swarm agent dispatch failed'), expectedCategory: 'swarm_error' },
      { error: new Error('Something completely unknown'), expectedCategory: 'unknown_error' },
    ]

    for (const { error, expectedCategory } of errorCases) {
      const classified = classifyError(error)
      expect(classified.category).toBe(expectedCategory)
      expect(classified.message.length).toBeGreaterThan(0)

      const userMessage = formatErrorForUser(classified)
      expect(userMessage.length).toBeGreaterThan(0)
    }
  })
})

describe('Policy enforcement proof', () => {
  it('validates each valid mode passes assertValidPolicy', () => {
    const modes = ['PLAN_ONLY', 'READ_ONLY', 'PROPOSAL_ONLY', 'APPROVED_EXECUTION'] as const

    for (const mode of modes) {
      const policy = { ...createDefaultRuntimePolicy(), mode }
      expect(() => assertValidPolicy(policy)).not.toThrow()
    }
  })

  it('rejects invalid mode', () => {
    const bad = { ...createDefaultRuntimePolicy(), mode: 'INVALID' }
    expect(() => assertValidPolicy(bad)).toThrow('Invalid policy mode')
  })

  it('rejects non-boolean flags', () => {
    const bad = { ...createDefaultRuntimePolicy(), allowNetwork: 'yes' }
    expect(() => assertValidPolicy(bad)).toThrow('must be a boolean')
  })

  it('rejects non-array protectedPaths', () => {
    const bad = { ...createDefaultRuntimePolicy(), protectedPaths: 'not-array' }
    expect(() => assertValidPolicy(bad)).toThrow('must be an array')
  })

  it('rejects empty string in protectedPaths', () => {
    const bad = { ...createDefaultRuntimePolicy(), protectedPaths: ['valid', ''] }
    expect(() => assertValidPolicy(bad)).toThrow('non-empty string')
  })
})
