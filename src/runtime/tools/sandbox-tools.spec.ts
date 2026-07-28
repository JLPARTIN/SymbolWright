import { describe, expect, it } from 'vitest'

import { buildSandboxInventory, runnerAvailability } from '../../sandbox/sandbox-registry.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import type { SandboxRunnerAvailability } from '../../sandbox/sandbox-types.js'
import type { SymbolWrightRuntimeMode, RuntimeToolContext } from '../types.js'
import { sandboxExecuteTool, sandboxListRuntimesTool } from './sandbox-tools.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'

function availability(command: string): SandboxRunnerAvailability {
  return runnerAvailability('available', CHECKED_AT, { version: `${command} test` })
}

function createService(): SandboxService {
  const env = {
    PATH: process.env['PATH'] ?? '',
    SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true',
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
  mode: SymbolWrightRuntimeMode,
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
      protectedPaths: ['.git', '.symbolwright'],
      noisyDirs: ['.git', '.symbolwright', 'node_modules'],
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
      sandboxExecuteTool.execute(
        { command: 'node -e "console.log(1)"' },
        context('APPROVED_EXECUTION'),
      ),
    ).rejects.toThrow('raw command/container field')
  })

  it('returns a proposal in PROPOSAL_ONLY without launching execution', async () => {
    const rendered = await sandboxExecuteTool.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('proposal only')",
      },
      context('PROPOSAL_ONLY'),
    )
    expect(rendered).toContain('PROPOSAL_ONLY')
    expect(rendered).toContain('fileCount')
  })

  it('rejects guarded-host and caller-selected repository roots from the agent tool', async () => {
    await expect(
      sandboxExecuteTool.execute(
        {
          languageId: 'javascript',
          mode: 'run',
          source: "console.log('must not run')",
          requestedRunnerId: 'guarded-host-javascript',
        },
        context('APPROVED_EXECUTION'),
      ),
    ).rejects.toThrow('trusted local host runners')

    await expect(
      sandboxExecuteTool.execute(
        {
          languageId: 'javascript',
          mode: 'run',
          repository: { rootPath: '/etc', selectedPaths: ['passwd'] },
        },
        context('APPROVED_EXECUTION'),
      ),
    ).rejects.toThrow('repository.rootPath')
  })

  it('records a server-safe policy-blocked execution through the shared service', async () => {
    const recorded: string[] = []
    const rendered = await sandboxExecuteTool.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('browser execution belongs in the browser')",
      },
      context('APPROVED_EXECUTION', {
        sessionId: 'mission_agent_tool_test',
        recordSandboxExecution: (_request, result) => recorded.push(result.executionId),
      }),
    )

    expect(rendered).toContain('"status": "policy-blocked"')
    expect(rendered).toContain('"trustClass": "browser-isolated"')
    expect(recorded).toEqual(['sandbox_agent_tool_test'])
  })
})
