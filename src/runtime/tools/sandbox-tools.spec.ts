import { describe, expect, it } from 'vitest'

import { buildSandboxInventory, runnerAvailability } from '../../sandbox/sandbox-registry.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import type { SandboxRunnerAvailability } from '../../sandbox/sandbox-types.js'
import type { CodemindRuntimeMode, RuntimeToolContext } from '../types.js'
import { sandboxExecuteTool, sandboxListRuntimesTool } from './sandbox-tools.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'

function availability(command: string): SandboxRunnerAvailability {
  return runnerAvailability('available', CHECKED_AT, { version: `${command} test` })
}

function createService(): SandboxService {
  const env = {
    PATH: process.env['PATH'] ?? '',
    CODEMIND_ALLOW_GUARDED_HOST_EXECUTION: 'true',
  }
  const commandAvailability = new Map<string, SandboxRunnerAvailability>([
    ['node', availability('node')],
  ])
  return new SandboxService({
    env,
    now: () => new Date(CHECKED_AT),
    generateExecutionId: () => 'sandbox_agent_tool_test',
    discoverCommandAvailability: async () => commandAvailability,
    buildInventory: () =>
      buildSandboxInventory({
        env,
        commandAvailability,
        now: () => new Date(CHECKED_AT),
      }),
  })
}

function context(
  mode: CodemindRuntimeMode,
  overrides: Partial<RuntimeToolContext> = {},
): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: {
      mode,
      allowNetwork: false,
      allowReadOnlyNetwork: true,
      allowShell: mode === 'APPROVED_EXECUTION',
      allowWrites: mode === 'APPROVED_EXECUTION',
      allowGitHubWrites: false,
      protectedPaths: ['.git', '.codemind'],
      noisyDirs: ['.git', '.codemind', 'node_modules'],
    },
    sandboxService: createService(),
    ...overrides,
  }
}

describe('sandbox runtime agent tools', () => {
  it('lists real runtime inventory without shell commands', async () => {
    const rendered = await sandboxListRuntimesTool.execute({}, context('READ_ONLY'))
    expect(rendered).toContain('guarded-host-javascript')
    expect(rendered).toContain('guarded-host')
    expect(rendered).toContain('javascript')
  })

  it('rejects raw command-shaped execution input', async () => {
    await expect(
      sandboxExecuteTool.execute({ command: 'node -e "console.log(1)"' }, context('APPROVED_EXECUTION')),
    ).rejects.toThrow('raw command/container field')
  })

  it('returns a proposal in PROPOSAL_ONLY without launching execution', async () => {
    const rendered = await sandboxExecuteTool.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('proposal only')",
        requestedRunnerId: 'guarded-host-javascript',
      },
      context('PROPOSAL_ONLY'),
    )
    expect(rendered).toContain('PROPOSAL_ONLY')
    expect(rendered).toContain('fileCount')
  })

  it('runs JavaScript through the shared sandbox service in APPROVED_EXECUTION', async () => {
    const recorded: string[] = []
    const rendered = await sandboxExecuteTool.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('agent sandbox ok')",
        requestedRunnerId: 'guarded-host-javascript',
      },
      context('APPROVED_EXECUTION', {
        sessionId: 'mission_agent_tool_test',
        recordSandboxExecution: (_request, result) => recorded.push(result.executionId),
      }),
    )

    expect(rendered).toContain('agent sandbox ok')
    expect(rendered).toContain('"status": "passed"')
    expect(rendered).toContain('"trustClass": "guarded-host"')
    expect(recorded).toEqual(['sandbox_agent_tool_test'])
  })
})
