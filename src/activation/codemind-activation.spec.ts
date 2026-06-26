import { describe, expect, it, vi } from 'vitest'

import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import type { RuntimeToolDefinition, RuntimeToolContext, RuntimePolicySnapshot } from '../runtime/types.js'
import {
  activateSubsystems,
  runActivatedAgent,
  verifySubsystemHealth,
  type CodemindActivationConfig,
} from './codemind-activation.js'

function createMockProvider(responses?: ProviderStreamEvent[][]): LLMProvider {
  let callIndex = 0
  const defaultResponse: ProviderStreamEvent[] = [
    { type: 'text_delta', text: 'Hello from CodeMind.' },
    { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 50 } },
  ]

  return {
    providerId: 'mock-anthropic',
    displayName: 'Mock Anthropic Provider',
    complete: vi.fn().mockImplementation(function* (): Generator<ProviderStreamEvent> {
      const events = responses !== undefined ? responses[callIndex++] ?? defaultResponse : defaultResponse
      for (const event of events) {
        yield event
      }
    }),
  }
}

function createTestPolicy(): RuntimePolicySnapshot {
  return {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  }
}

function createTestContext(): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: createTestPolicy(),
  }
}

function createTestTools(): RuntimeToolDefinition[] {
  return [
    {
      name: 'read_file',
      description: 'Read a file',
      capability: 'READ',
      execute: vi.fn().mockResolvedValue('file contents'),
    },
    {
      name: 'search_files',
      description: 'Search files',
      capability: 'SEARCH',
      execute: vi.fn().mockResolvedValue('search results'),
    },
  ]
}

function createTestConfig(overrides?: Partial<CodemindActivationConfig>): CodemindActivationConfig {
  return {
    provider: createMockProvider(),
    tools: createTestTools(),
    toolContext: createTestContext(),
    ...overrides,
  }
}

describe('activateSubsystems', () => {
  it('creates all subsystems', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)

    expect(subsystems.provider).toBeDefined()
    expect(subsystems.registry).toBeDefined()
    expect(subsystems.dispatcher).toBeDefined()
    expect(subsystems.systemPrompt.length).toBeGreaterThan(0)
    expect(subsystems.tuiState.session.sessionId).toBeDefined()
    expect(subsystems.tools).toHaveLength(2)
  })

  it('uses custom session ID when provided', () => {
    const config = createTestConfig({ sessionId: 'custom-session-42' })
    const subsystems = activateSubsystems(config)

    expect(subsystems.tuiState.session.sessionId).toBe('custom-session-42')
  })

  it('generates session ID when not provided', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)

    expect(subsystems.tuiState.session.sessionId).toMatch(/^cm-\d+$/)
  })

  it('includes swarm agents in system prompt', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)

    expect(subsystems.systemPrompt).toContain('investigator')
    expect(subsystems.systemPrompt).toContain('coder')
    expect(subsystems.systemPrompt).toContain('analyzer')
    expect(subsystems.systemPrompt).toContain('reviewer')
    expect(subsystems.systemPrompt).toContain('reporter')
  })

  it('includes permission mode in system prompt', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)

    expect(subsystems.systemPrompt).toContain('READ_ONLY')
  })

  it('registers all 5 swarm agent types', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const types = subsystems.registry.listAgentTypes()

    expect(types).toHaveLength(5)
  })
})

describe('runActivatedAgent', () => {
  it('runs agent loop with unified system prompt', async () => {
    const provider = createMockProvider()
    const config = createTestConfig({ provider })

    const result = await runActivatedAgent(config, 'Read the README')

    expect(result.agentResult.status).toBe('completed')
    expect(result.agentResult.finalText).toBe('Hello from CodeMind.')
    expect(result.tuiState).toBeDefined()
  })

  it('updates TUI state with token count', async () => {
    const config = createTestConfig()
    const result = await runActivatedAgent(config, 'Summarize the project')

    expect(result.tuiState.session.tokenCount).toBe(150)
  })

  it('calls onEvent callback', async () => {
    const events: string[] = []
    const config = createTestConfig({
      onEvent: (event) => events.push(event.type),
    })

    await runActivatedAgent(config, 'Hello')
    expect(events).toContain('text_delta')
    expect(events).toContain('iteration_start')
    expect(events).toContain('iteration_end')
    expect(events).toContain('loop_end')
  })

  it('calls onTuiUpdate callback', async () => {
    const updates: TuiStateSnapshot[] = []
    const config = createTestConfig({
      onTuiUpdate: (state) => updates.push({ streaming: state.streaming, tokenCount: state.session.tokenCount }),
    })

    await runActivatedAgent(config, 'Hello')
    expect(updates.length).toBeGreaterThan(0)
  })

  it('handles tool use in agent loop', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_use_start', id: 'tu-1', name: 'read_file' },
        { type: 'tool_use_end', id: 'tu-1', name: 'read_file', input: { path: 'README.md' } },
        { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 50, outputTokens: 30 } },
      ],
      [
        { type: 'text_delta', text: 'Based on the README...' },
        { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 80, outputTokens: 60 } },
      ],
    ])

    const config = createTestConfig({ provider })
    const result = await runActivatedAgent(config, 'Read the README')

    expect(result.agentResult.status).toBe('completed')
    expect(result.agentResult.totalIterations).toBe(2)
    expect(result.agentResult.finalText).toBe('Based on the README...')
  })

  it('returns empty swarm dispatches and ajna reviews for basic run', async () => {
    const config = createTestConfig()
    const result = await runActivatedAgent(config, 'Hello')

    expect(result.swarmDispatches).toHaveLength(0)
    expect(result.ajnaReviews).toHaveLength(0)
  })
})

describe('verifySubsystemHealth', () => {
  it('reports all subsystems healthy', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const report = verifySubsystemHealth(subsystems)

    expect(report.healthy).toBe(true)
    expect(report.checks.length).toBeGreaterThanOrEqual(6)
  })

  it('checks provider health', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const report = verifySubsystemHealth(subsystems)

    const providerCheck = report.checks.find((c) => c.name === 'Provider')
    expect(providerCheck).toBeDefined()
    expect(providerCheck!.healthy).toBe(true)
    expect(providerCheck!.detail).toContain('Mock Anthropic Provider')
  })

  it('checks tool registry', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const report = verifySubsystemHealth(subsystems)

    const toolCheck = report.checks.find((c) => c.name === 'Tool Registry')
    expect(toolCheck).toBeDefined()
    expect(toolCheck!.healthy).toBe(true)
    expect(toolCheck!.detail).toContain('2 tools')
  })

  it('checks HiveMind registry', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const report = verifySubsystemHealth(subsystems)

    const hivemindCheck = report.checks.find((c) => c.name === 'HiveMind Registry')
    expect(hivemindCheck).toBeDefined()
    expect(hivemindCheck!.healthy).toBe(true)
    expect(hivemindCheck!.detail).toContain('5/5')
  })

  it('checks system prompt', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const report = verifySubsystemHealth(subsystems)

    const promptCheck = report.checks.find((c) => c.name === 'System Prompt')
    expect(promptCheck).toBeDefined()
    expect(promptCheck!.healthy).toBe(true)
  })

  it('checks policy mode', () => {
    const config = createTestConfig()
    const subsystems = activateSubsystems(config)
    const report = verifySubsystemHealth(subsystems)

    const policyCheck = report.checks.find((c) => c.name === 'Policy')
    expect(policyCheck).toBeDefined()
    expect(policyCheck!.detail).toContain('READ_ONLY')
  })
})

interface TuiStateSnapshot {
  readonly streaming: boolean
  readonly tokenCount: number
}
