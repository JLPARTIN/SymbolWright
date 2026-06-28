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

import { runAgentCommand } from './cli-agent.js'
import { resolveCodemindConfig, validateCodemindConfig } from './config/codemind-config.js'
import { createAnthropicProvider } from './provider/anthropic-provider.js'
import { runActivatedAgent } from './activation/codemind-activation.js'

const mockResolve = vi.mocked(resolveCodemindConfig)
const mockValidate = vi.mocked(validateCodemindConfig)
const mockCreateProvider = vi.mocked(createAnthropicProvider)
const mockRunAgent = vi.mocked(runActivatedAgent)

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

    it('runs one-shot mode when args are provided', async () => {
      mockResolve.mockReturnValue({ anthropicApiKey: 'sk-test-key' })
      mockValidate.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        redactedSummary: {
          hasApiKey: true,
          apiKeyPreview: 'sk-t...tkey',
          hasGitHubToken: false,
          hasVoyageApiKey: false,
        },
      })
      mockCreateProvider.mockReturnValue({
        providerId: 'anthropic',
        displayName: 'Test Provider',
        complete: async function* () {
          yield {
            type: 'message_stop' as const,
            stopReason: 'end_turn',
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        },
      })
      mockRunAgent.mockResolvedValue({
        agentResult: {
          status: 'completed',
          finalText: 'done',
          iterations: [],
          totalIterations: 1,
          totalUsage: { inputTokens: 10, outputTokens: 5 },
        },
        swarmDispatches: [],
        ajnaReviews: [],
        tuiState: {} as never,
      })

      await runAgentCommand(['hello', 'world'])

      expect(mockRunAgent).toHaveBeenCalled()
      const callArgs = mockRunAgent.mock.calls[0]
      expect(callArgs?.[1]).toBe('hello world')
    })
  })
})
