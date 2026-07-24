import { describe, expect, it } from 'vitest'

import type {
  SandboxCommandRequest,
  SandboxRunner,
  SandboxRunnerResult,
} from '../runtime/sandbox/sandbox-runner.js'
import { createSandboxScriptEvidenceProvider } from './sandbox-evidence-provider.js'

function fakeSandboxRunner(result: Partial<SandboxRunnerResult>): {
  readonly runner: SandboxRunner
  readonly calls: SandboxCommandRequest[]
} {
  const calls: SandboxCommandRequest[] = []
  return {
    calls,
    runner: {
      runCommand: async (request) => {
        calls.push(request)
        return {
          outcome: 'EXECUTED',
          runner: 'docker',
          command: `${request.binary} ${request.args.join(' ')}`,
          stdout: '',
          stderr: '',
          exitCode: 0,
          reason: null,
          ...result,
        }
      },
    },
  }
}

describe('sandbox script evidence provider', () => {
  it('blocks non-npm package managers without invoking the sandbox', async () => {
    let invoked = false
    const runner: SandboxRunner = {
      runCommand: async () => {
        invoked = true
        return {
          outcome: 'EXECUTED',
          runner: 'docker',
          command: 'noop',
          stdout: '',
          stderr: '',
          exitCode: 0,
          reason: null,
        }
      },
    }

    const provider = createSandboxScriptEvidenceProvider(runner)
    const result = await provider({
      repoRoot: '/repo',
      packageManager: 'pnpm',
      script: 'test',
      command: 'pnpm run test',
    })

    expect(invoked).toBe(false)
    expect(result.status).toBe('blocked')
    expect(result.reason).toContain('npm')
  })

  it('runs npm scripts through the sandbox runner and reports pass on exit code 0', async () => {
    const sandbox = fakeSandboxRunner({ exitCode: 0, stdout: 'ok' })
    const provider = createSandboxScriptEvidenceProvider(sandbox.runner)

    const result = await provider({
      repoRoot: '/repo',
      packageManager: 'npm',
      script: 'typecheck',
      command: 'npm run typecheck',
    })

    expect(result.status).toBe('passed')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(sandbox.calls).toEqual([
      {
        binary: 'npm',
        args: ['run', 'typecheck'],
        workspaceRoot: '/repo',
      },
    ])
  })

  it('gives the full test suite a longer timeout than the sandbox default', async () => {
    const sandbox = fakeSandboxRunner({ exitCode: 0 })
    const provider = createSandboxScriptEvidenceProvider(sandbox.runner)

    await provider({
      repoRoot: '/repo',
      packageManager: 'npm',
      script: 'test',
      command: 'npm run test',
    })

    expect(sandbox.calls[0]?.timeoutMs).toBe(300_000)
  })

  it('reports failed status on non-zero exit code', async () => {
    const sandbox = fakeSandboxRunner({ exitCode: 1, stderr: 'boom' })
    const provider = createSandboxScriptEvidenceProvider(sandbox.runner)

    const result = await provider({
      repoRoot: '/repo',
      packageManager: 'npm',
      script: 'lint',
      command: 'npm run lint',
    })

    expect(result.status).toBe('failed')
    expect(result.exitCode).toBe(1)
  })

  it('reports blocked status when the sandbox itself blocks execution', async () => {
    const sandbox = fakeSandboxRunner({
      outcome: 'BLOCKED',
      exitCode: null,
      reason: 'Sandbox runner unavailable; host execution is not allowed.',
    })
    const provider = createSandboxScriptEvidenceProvider(sandbox.runner)

    const result = await provider({
      repoRoot: '/repo',
      packageManager: 'npm',
      script: 'build',
      command: 'npm run build',
    })

    expect(result.status).toBe('blocked')
    expect(result.reason).toContain('Sandbox runner unavailable')
  })
})
