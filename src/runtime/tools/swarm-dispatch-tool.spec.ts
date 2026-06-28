import { describe, expect, it } from 'vitest'

import {
  parseSwarmDispatchInput,
  swarmDispatchTool,
  createWiredSwarmDispatchTool,
} from './swarm-dispatch-tool.js'
import type { RuntimeToolContext, RuntimePolicySnapshot } from '../types.js'
import type { SwarmDispatchResult } from '../../hivemind/hivemind.types.js'
import type { HiveMindDispatcher } from '../../hivemind/hivemind-dispatcher.js'

function createTestContext(): RuntimeToolContext {
  const policy: RuntimePolicySnapshot = {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: false,
    allowShell: true,
    allowWrites: true,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  }
  return { cwd: '/test', policy }
}

describe('parseSwarmDispatchInput', () => {
  it('parses valid input', () => {
    const input = { agentType: 'investigator', goal: 'find bugs' }
    const parsed = parseSwarmDispatchInput(input)

    expect(parsed.agentType).toBe('investigator')
    expect(parsed.goal).toBe('find bugs')
  })

  it('parses input with context', () => {
    const input = { agentType: 'coder', goal: 'fix bug', context: 'in utils.ts' }
    const parsed = parseSwarmDispatchInput(input)

    expect(parsed.context).toBe('in utils.ts')
  })

  it('rejects null input', () => {
    expect(() => parseSwarmDispatchInput(null)).toThrow('Missing input')
  })

  it('rejects missing agentType', () => {
    expect(() => parseSwarmDispatchInput({ goal: 'test' })).toThrow('Missing agentType')
  })

  it('rejects invalid agentType', () => {
    expect(() => parseSwarmDispatchInput({ agentType: 'invalid', goal: 'test' })).toThrow(
      'Invalid agentType',
    )
  })

  it('rejects empty goal', () => {
    expect(() => parseSwarmDispatchInput({ agentType: 'investigator', goal: '' })).toThrow(
      'Missing or empty goal',
    )
  })
})

describe('swarmDispatchTool (static fallback)', () => {
  it('returns QUEUED status', async () => {
    const result = await swarmDispatchTool.execute(
      { agentType: 'investigator', goal: 'analyze code' },
      createTestContext(),
    )

    expect(result).toContain('QUEUED')
    expect(result).toContain('investigator')
  })
})

describe('createWiredSwarmDispatchTool', () => {
  it('dispatches through the provided dispatcher', async () => {
    const mockResult: SwarmDispatchResult = {
      taskId: 'swarm-123',
      agentId: 'agent-inv-1',
      status: 'completed',
      output: 'Found 3 bugs',
      durationMs: 1500,
      auditReceipt: {
        taskId: 'swarm-123',
        agentId: 'agent-inv-1',
        agentType: 'investigator',
        role: 'researcher',
        toolsUsed: ['read_file'],
        iterationCount: 2,
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        timestamp: new Date().toISOString(),
      },
    }

    const mockDispatcher = {
      dispatch: async () => mockResult,
    } as unknown as HiveMindDispatcher

    const collectedResults: SwarmDispatchResult[] = []
    const wiredTool = createWiredSwarmDispatchTool(mockDispatcher, (r) => collectedResults.push(r))

    const result = await wiredTool.execute(
      { agentType: 'investigator', goal: 'find bugs' },
      createTestContext(),
    )

    expect(result).toContain('agent-inv-1')
    expect(result).toContain('COMPLETED')
    expect(result).toContain('Found 3 bugs')
    expect(collectedResults).toHaveLength(1)
    expect(collectedResults[0]?.agentId).toBe('agent-inv-1')
  })

  it('has the correct tool name', () => {
    const mockDispatcher = {
      dispatch: async () => ({}),
    } as unknown as HiveMindDispatcher

    const wiredTool = createWiredSwarmDispatchTool(mockDispatcher)
    expect(wiredTool.name).toBe('swarm_dispatch')
  })
})
