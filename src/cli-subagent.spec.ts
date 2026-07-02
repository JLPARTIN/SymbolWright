import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./config/codemind-config.js', () => ({
  resolveCodemindConfig: vi.fn(),
  validateCodemindConfig: vi.fn(),
}))

vi.mock('./cli-agent.js', () => ({
  createProvider: vi.fn(),
}))

const mockDispatch = vi.fn()
vi.mock('./hivemind/subagent-dispatcher.js', () => ({
  SubagentDispatcher: vi.fn().mockImplementation(function (this: {
    dispatch: typeof mockDispatch
  }) {
    this.dispatch = mockDispatch
  }),
}))

import { renderSubagentListCommand, runSubagentRunCommand } from './cli-subagent.js'
import { resolveCodemindConfig, validateCodemindConfig } from './config/codemind-config.js'
import { createProvider } from './cli-agent.js'
import type { SubagentDispatchEvidence } from './hivemind/subagent-dispatcher.js'

const mockResolve = vi.mocked(resolveCodemindConfig)
const mockValidate = vi.mocked(validateCodemindConfig)
const mockCreateProvider = vi.mocked(createProvider)

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

describe('renderSubagentListCommand', () => {
  it('lists all three workers with their allowed and governed tools', () => {
    const output = renderSubagentListCommand()

    expect(output).toContain('explorer (readonly)')
    expect(output).toContain('reviewer (readonly)')
    expect(output).toContain('test-planner (readonly)')
    expect(output).toContain('allowed: read_file, list_files, search_files, glob, grep')
    expect(output).toContain('governed (requires --enable-governed):')
    expect(output).toContain('subagent_run')
  })
})

describe('runSubagentRunCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws a usage error when the subagent name is missing', async () => {
    await expect(runSubagentRunCommand([])).rejects.toThrow(/Usage: codemind subagent run/)
  })

  it('throws a usage error when the goal is missing', async () => {
    await expect(runSubagentRunCommand(['explorer'])).rejects.toThrow(
      /Usage: codemind subagent run/,
    )
  })

  it('rejects an unknown subagent name before touching config or the provider', async () => {
    await expect(runSubagentRunCommand(['coder', 'do something'])).rejects.toThrow(
      /Invalid subagent "coder"/,
    )
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('surfaces config validation errors instead of dispatching', async () => {
    mockResolve.mockReturnValue({} as never)
    mockValidate.mockReturnValue({
      valid: false,
      errors: ['Missing API key.'],
      warnings: [],
    } as never)

    await expect(runSubagentRunCommand(['explorer', 'find the auth code'])).rejects.toThrow(
      /Missing API key/,
    )
    expect(mockCreateProvider).not.toHaveBeenCalled()
  })

  it('dispatches through a real SubagentDispatcher and renders the evidence', async () => {
    mockResolve.mockReturnValue({} as never)
    mockValidate.mockReturnValue(validConfig() as never)
    mockCreateProvider.mockReturnValue({ providerId: 'anthropic', displayName: 'Test' } as never)

    const evidence: SubagentDispatchEvidence = {
      tool: 'subagent_run',
      subagent: 'explorer',
      status: 'completed',
      parentSessionId: 'cm-cli-1',
      childSessionId: 'sub-1-aaaaaaaa',
      governedToolsEnabled: false,
      toolsUsed: ['read_file'],
      iterationCount: 1,
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
      result: {
        findings: ['found it'],
        evidence: [],
        risks: [],
        rawOutput: '## Findings\n- found it',
      },
      durationMs: 42,
      auditTrace: [],
    }
    mockDispatch.mockResolvedValue(evidence)

    const output = await runSubagentRunCommand(['explorer', 'find', 'the', 'auth', 'code'])

    expect(mockDispatch).toHaveBeenCalledWith({
      subagent: 'explorer',
      goal: 'find the auth code',
      enableGovernedTools: false,
    })
    expect(output).toContain('found it')
    expect(output).toContain('COMPLETED')
  })

  it('passes enableGovernedTools through from --enable-governed', async () => {
    mockResolve.mockReturnValue({} as never)
    mockValidate.mockReturnValue(validConfig() as never)
    mockCreateProvider.mockReturnValue({ providerId: 'anthropic', displayName: 'Test' } as never)
    mockDispatch.mockResolvedValue({
      tool: 'subagent_run',
      subagent: 'test-planner',
      status: 'completed',
      parentSessionId: 'cm-cli-1',
      childSessionId: 'sub-1-aaaaaaaa',
      governedToolsEnabled: true,
      toolsUsed: [],
      iterationCount: 1,
      tokenUsage: { inputTokens: 1, outputTokens: 1 },
      result: { findings: [], evidence: [], risks: [], rawOutput: '' },
      durationMs: 1,
      auditTrace: [],
    } as SubagentDispatchEvidence)

    await runSubagentRunCommand(['test-planner', 'plan tests', '--enable-governed'])

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ enableGovernedTools: true }),
    )
  })

  it('supports --json output', async () => {
    mockResolve.mockReturnValue({} as never)
    mockValidate.mockReturnValue(validConfig() as never)
    mockCreateProvider.mockReturnValue({ providerId: 'anthropic', displayName: 'Test' } as never)
    const evidence: SubagentDispatchEvidence = {
      tool: 'subagent_run',
      subagent: 'reviewer',
      status: 'completed',
      parentSessionId: 'cm-cli-1',
      childSessionId: 'sub-1-aaaaaaaa',
      governedToolsEnabled: false,
      toolsUsed: [],
      iterationCount: 1,
      tokenUsage: { inputTokens: 1, outputTokens: 1 },
      result: { findings: [], evidence: [], risks: [], rawOutput: '' },
      durationMs: 1,
      auditTrace: [],
    }
    mockDispatch.mockResolvedValue(evidence)

    const output = await runSubagentRunCommand(['reviewer', 'review', 'the', 'diff', '--json'])
    const parsed = JSON.parse(output) as SubagentDispatchEvidence
    expect(parsed.childSessionId).toBe('sub-1-aaaaaaaa')
  })
})
