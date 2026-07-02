import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./config/codemind-config.js', () => ({
  resolveCodemindConfig: vi.fn(),
  validateCodemindConfig: vi.fn(),
}))

vi.mock('./provider/anthropic-provider.js', () => ({
  createAnthropicProvider: vi.fn(),
}))

vi.mock('./activation/codemind-activation.js', () => ({
  runActivatedAgent: vi.fn(),
}))

vi.mock('./memory/agent-memory-session.js', () => ({
  initializeAgentMemorySession: vi.fn(),
}))

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runAgentCommand, renderSessionsList } from './cli-agent.js'
import { resolveCodemindConfig, validateCodemindConfig } from './config/codemind-config.js'
import { createAnthropicProvider } from './provider/anthropic-provider.js'
import { runActivatedAgent } from './activation/codemind-activation.js'
import { initializeAgentMemorySession } from './memory/agent-memory-session.js'
import { SessionPersistence } from './storage/session-persistence.js'

const mockResolve = vi.mocked(resolveCodemindConfig)
const mockValidate = vi.mocked(validateCodemindConfig)
const mockCreateProvider = vi.mocked(createAnthropicProvider)
const mockRunAgent = vi.mocked(runActivatedAgent)
const mockInitializeMemory = vi.mocked(initializeAgentMemorySession)

function validConfig() {
  return {
    valid: true as const,
    errors: [] as string[],
    warnings: [] as string[],
    redactedSummary: {
      hasApiKey: true,
      apiKeyPreview: 'sk-t...tkey',
      hasGitHubToken: false,
      hasVoyageApiKey: false,
    },
  }
}

function mockProvider() {
  return {
    providerId: 'anthropic' as const,
    displayName: 'Test Provider',
    complete: async function* () {
      yield {
        type: 'message_stop' as const,
        stopReason: 'end_turn' as const,
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    },
  }
}

function mockAgentResult(status: 'completed' | 'error' = 'completed') {
  return {
    agentResult: {
      status,
      finalText: 'done',
      iterations: [],
      totalIterations: 1,
      totalUsage: { inputTokens: 10, outputTokens: 5 },
    },
    swarmDispatches: [],
    subagentDispatches: [],
    ajnaReviews: [],
    tuiState: {} as never,
  }
}

describe('cli-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  describe('runAgentCommand', () => {
    it('exits with error when config is invalid', async () => {
      mockResolve.mockReturnValue({})
      mockValidate.mockReturnValue({
        valid: false,
        errors: ['Missing API key.'],
        warnings: [],
        redactedSummary: { hasApiKey: false, hasGitHubToken: false, hasVoyageApiKey: false },
      })

      await expect(runAgentCommand(['test'])).rejects.toThrow('process.exit')
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Missing API key'))
    })

    it('logs warnings from config validation', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue({
        ...validConfig(),
        warnings: ['Model not set, using default.'],
      })
      mockCreateProvider.mockReturnValue(mockProvider())
      mockRunAgent.mockResolvedValue(mockAgentResult())

      await runAgentCommand(['hello'])

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Model not set'))
    })

    it('runs one-shot mode when args are provided', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue(validConfig())
      mockCreateProvider.mockReturnValue(mockProvider())
      mockRunAgent.mockResolvedValue(mockAgentResult())

      await runAgentCommand(['hello', 'world'])

      expect(mockRunAgent).toHaveBeenCalled()
      const callArgs = mockRunAgent.mock.calls[0]
      expect(callArgs?.[1]).toBe('hello world')
    })

    it('sets process.exitCode on agent error status', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue(validConfig())
      mockCreateProvider.mockReturnValue(mockProvider())
      mockRunAgent.mockResolvedValue(mockAgentResult('error'))

      await runAgentCommand(['fail'])

      expect(process.exitCode).toBe(1)
    })

    it('wires memory tools into the tool context and closes the session when the run completes', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue(validConfig())
      mockCreateProvider.mockReturnValue(mockProvider())
      mockRunAgent.mockResolvedValue(mockAgentResult())

      const recordTurn = vi.fn().mockResolvedValue(undefined)
      const runMaintenance = vi.fn().mockReturnValue(0)
      const close = vi.fn()
      const tools = { marker: 'memory-tools' }
      mockInitializeMemory.mockReturnValue({
        tools: tools as never,
        migrationResult: { status: 'skipped', reason: 'missing' },
        recordTurn,
        runMaintenance,
        close,
      })

      await runAgentCommand(['hello'])

      const config = mockRunAgent.mock.calls[0]?.[0] as { toolContext: { memoryTools?: unknown } }
      expect(config.toolContext.memoryTools).toBe(tools)
      expect(recordTurn).toHaveBeenCalledTimes(2)
      expect(runMaintenance).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledOnce()
    })

    it('omits memoryTools from the tool context when memory initialization fails', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue(validConfig())
      mockCreateProvider.mockReturnValue(mockProvider())
      mockRunAgent.mockResolvedValue(mockAgentResult())
      mockInitializeMemory.mockImplementation(() => {
        throw new Error('sqlite unavailable')
      })

      await runAgentCommand(['hello'])

      const config = mockRunAgent.mock.calls[0]?.[0] as { toolContext: { memoryTools?: unknown } }
      expect(config.toolContext.memoryTools).toBeUndefined()
    })

    it('handles --approved flag', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue(validConfig())
      mockCreateProvider.mockReturnValue(mockProvider())
      mockRunAgent.mockResolvedValue(mockAgentResult())

      await runAgentCommand(['--approved', 'do work'])

      expect(mockRunAgent).toHaveBeenCalled()
      const config = mockRunAgent.mock.calls[0]?.[0]
      expect(config).toBeDefined()
    })

    it('exits when multiple validation errors exist', async () => {
      mockResolve.mockReturnValue({})
      mockValidate.mockReturnValue({
        valid: false,
        errors: ['Missing API key.', 'Invalid model.'],
        warnings: [],
        redactedSummary: { hasApiKey: false, hasGitHubToken: false, hasVoyageApiKey: false },
      })

      await expect(runAgentCommand(['test'])).rejects.toThrow('process.exit')
      expect(console.error).toHaveBeenCalledTimes(2)
    })
  })

  describe('renderSessionsList', () => {
    it('returns empty message when no sessions exist', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-sessions-'))
      const persistence = new SessionPersistence(dir)

      const output = renderSessionsList(persistence)

      expect(output).toBe('No saved sessions.')
    })

    it('lists sessions with metadata', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-sessions-'))
      const persistence = new SessionPersistence(dir)

      persistence.appendMessage('test-session-1', {
        id: 'msg-1',
        role: 'user',
        content: 'hello',
        timestamp: '2026-01-01T00:00:00.000Z',
      })

      const output = renderSessionsList(persistence)

      expect(output).toContain('CodeMind Sessions')
      expect(output).toContain('test-session-1')
      expect(output).toContain('1 messages')
    })
  })
})
