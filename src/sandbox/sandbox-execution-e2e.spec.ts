import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SandboxHistoryStore } from './sandbox-history.js'
import { buildSandboxInventory, runnerAvailability } from './sandbox-registry.js'
import { SandboxService } from './sandbox-service.js'
import type { SandboxRunnerAvailability } from './sandbox-types.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'
const EXECUTION_ENV: NodeJS.ProcessEnv = {
  PATH: process.env['PATH'] ?? '',
  SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true',
}

const workspaces: string[] = []

function commandAvailable(command: string, args: readonly string[] = ['--version']): boolean {
  try {
    execFileSync(command, args, { env: EXECUTION_ENV, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function availability(command: string, version = `${command} test`): SandboxRunnerAvailability {
  return runnerAvailability('available', CHECKED_AT, { version })
}

async function createService(
  commands: ReadonlyMap<string, SandboxRunnerAvailability>,
  generateExecutionId = () => 'sandbox_test_execution',
): Promise<SandboxService> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-sandbox-test-'))
  workspaces.push(workspaceRoot)
  const historyStore = new SandboxHistoryStore({ workspaceRoot })
  return new SandboxService({
    env: EXECUTION_ENV,
    historyStore,
    generateExecutionId,
    inventory: buildSandboxInventory({
      env: EXECUTION_ENV,
      commandAvailability: commands,
      now: () => new Date(CHECKED_AT),
    }),
  })
}

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  )
})

describe('working sandbox execution vertical path', () => {
  it('executes JavaScript through the guarded-host backend and persists history', async () => {
    const service = await createService(new Map([['node', availability('node')]]))

    const result = await service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: "console.log('sandbox-js-ok')",
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status).toBe('passed')
    expect(result.stdout).toContain('sandbox-js-ok')
    expect(result.backend).toBe('guarded-host')
    expect(result.trustClass).toBe('guarded-host')
    expect(result.evidence.verificationLevel).toBe('EXECUTED')
    expect(result.cleanup).toEqual({ attempted: true, succeeded: true })
    expect(service.listExecutions().executions[0]?.executionId).toBe(result.executionId)
  })

  it('classifies runtime errors separately from compile errors', async () => {
    const service = await createService(new Map([['node', availability('node')]]))

    const result = await service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: "throw new Error('boom')",
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status).toBe('runtime-error')
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('boom')
  })

  it('cancels a real active execution and records a terminal result', async () => {
    const service = await createService(
      new Map([['node', availability('node')]]),
      () => 'sandbox_cancel_me',
    )

    const execution = service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: "setInterval(() => console.log('tick'), 1000)",
        limits: { timeoutMs: 5_000 },
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    await new Promise((resolve) => setTimeout(resolve, 100))
    const cancellation = await service.cancelExecution('sandbox_cancel_me')
    const result = await execution

    expect(cancellation.ok).toBe(true)
    expect(result.status).toBe('cancelled')
    expect(result.cleanup.succeeded).toBe(true)
  })

  it.runIf(commandAvailable('python3'))(
    'executes Python when python3 is actually available',
    async () => {
      const service = await createService(new Map([['python3', availability('python3')]]))

      const result = await service.execute(
        {
          languageId: 'python',
          mode: 'run',
          requestedRunnerId: 'guarded-host-python',
          source: "print('sandbox-python-ok')",
        },
        { mode: 'APPROVED_EXECUTION' },
      )

      expect(result.status).toBe('passed')
      expect(result.stdout).toContain('sandbox-python-ok')
    },
  )

  it.runIf(commandAvailable('go'))('executes Go when go is actually available', async () => {
    const service = await createService(new Map([['go', availability('go')]]))

    const result = await service.execute(
      {
        languageId: 'go',
        mode: 'run',
        requestedRunnerId: 'guarded-host-go',
        source: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("sandbox-go-ok") }\n',
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status).toBe('passed')
    expect(result.stdout).toContain('sandbox-go-ok')
  })
})
