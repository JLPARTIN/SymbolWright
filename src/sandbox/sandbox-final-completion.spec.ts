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
  SYMBOLWRIGHT_SECRET_TOKEN: 'sandbox-final-secret',
}

const workspaces: string[] = []

interface RuntimeProofCase {
  readonly languageId: 'javascript' | 'python' | 'go'
  readonly runnerId: string
  readonly command: string
  readonly probeArgs?: readonly string[]
  readonly successSource: string
  readonly successOutput: string
  readonly runtimeFailureSource: string
  readonly runtimeFailureText: string
  readonly timeoutSource: string
}

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

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-sandbox-final-'))
  workspaces.push(workspaceRoot)
  return workspaceRoot
}

function createService(
  workspaceRoot: string,
  commands: ReadonlyMap<string, SandboxRunnerAvailability>,
  generateExecutionId: () => string,
): SandboxService {
  return new SandboxService({
    env: EXECUTION_ENV,
    historyStore: new SandboxHistoryStore({ workspaceRoot, env: EXECUTION_ENV }),
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

const JS_SUCCESS_SOURCE = [
  "console.log('sandbox-js-proof')",
  "console.log(process.env.SYMBOLWRIGHT_SECRET_TOKEN ?? 'NO_SECRET')",
].join('\n')

const PYTHON_SUCCESS_SOURCE = [
  'import os',
  "print('sandbox-python-proof')",
  "print(os.environ.get('SYMBOLWRIGHT_SECRET_TOKEN', 'NO_SECRET'))",
].join('\n')

const GO_SUCCESS_SOURCE = [
  'package main',
  '',
  'import (',
  '  "fmt"',
  '  "os"',
  ')',
  '',
  'func main() {',
  '  fmt.Println("sandbox-go-proof")',
  '  value := os.Getenv("SYMBOLWRIGHT_SECRET_TOKEN")',
  '  if value == "" { value = "NO_SECRET" }',
  '  fmt.Println(value)',
  '}',
].join('\n')

const runtimeCases: readonly RuntimeProofCase[] = [
  {
    languageId: 'javascript',
    runnerId: 'guarded-host-javascript',
    command: 'node',
    successSource: JS_SUCCESS_SOURCE,
    successOutput: 'sandbox-js-proof',
    runtimeFailureSource: "throw new Error('sandbox-js-boom')",
    runtimeFailureText: 'sandbox-js-boom',
    timeoutSource: "setInterval(() => console.log('sandbox-js-tick'), 1000)",
  },
  {
    languageId: 'python',
    runnerId: 'guarded-host-python',
    command: 'python3',
    successSource: PYTHON_SUCCESS_SOURCE,
    successOutput: 'sandbox-python-proof',
    runtimeFailureSource: "raise RuntimeError('sandbox-python-boom')\n",
    runtimeFailureText: 'sandbox-python-boom',
    timeoutSource: 'while True:\n    pass\n',
  },
  {
    languageId: 'go',
    runnerId: 'guarded-host-go',
    command: 'go',
    probeArgs: ['version'],
    successSource: GO_SUCCESS_SOURCE,
    successOutput: 'sandbox-go-proof',
    runtimeFailureSource: 'package main\n\nfunc main() { panic("sandbox-go-boom") }\n',
    runtimeFailureText: 'sandbox-go-boom',
    timeoutSource: 'package main\n\nfunc main() { select {} }\n',
  },
]

describe('final working sandbox completion proof', () => {
  for (const runtimeCase of runtimeCases) {
    it.runIf(commandAvailable(runtimeCase.command, runtimeCase.probeArgs))(
      `proves ${runtimeCase.languageId} success, failure, timeout, cleanup, and history`,
      async () => {
        const workspaceRoot = await createWorkspace()
        let counter = 0
        const service = createService(
          workspaceRoot,
          new Map([[runtimeCase.command, availability(runtimeCase.command)]]),
          () => `sandbox_final_${runtimeCase.languageId}_${++counter}`,
        )

        const success = await service.execute(
          {
            languageId: runtimeCase.languageId,
            mode: 'run',
            requestedRunnerId: runtimeCase.runnerId,
            source: runtimeCase.successSource,
          },
          { mode: 'APPROVED_EXECUTION' },
        )

        expect(success.status).toBe('passed')
        expect(success.stdout).toContain(runtimeCase.successOutput)
        expect(success.stdout).toContain('NO_SECRET')
        expect(success.stdout).not.toContain('sandbox-final-secret')
        expect(success.evidence.verificationLevel).toBe('EXECUTED')
        expect(success.cleanup).toEqual({ attempted: true, succeeded: true })

        const failure = await service.execute(
          {
            languageId: runtimeCase.languageId,
            mode: 'run',
            requestedRunnerId: runtimeCase.runnerId,
            source: runtimeCase.runtimeFailureSource,
          },
          { mode: 'APPROVED_EXECUTION' },
        )

        expect(failure.status).toBe('runtime-error')
        expect(`${failure.stdout}\n${failure.stderr}`).toContain(runtimeCase.runtimeFailureText)
        expect(failure.cleanup.succeeded).toBe(true)

        const timeout = await service.execute(
          {
            languageId: runtimeCase.languageId,
            mode: 'run',
            requestedRunnerId: runtimeCase.runnerId,
            source: runtimeCase.timeoutSource,
            limits: { timeoutMs: 500, maxOutputBytes: 512 },
          },
          { mode: 'APPROVED_EXECUTION' },
        )

        expect(timeout.status).toBe('timeout')
        expect(timeout.cleanup.succeeded).toBe(true)

        const restarted = createService(
          workspaceRoot,
          new Map([[runtimeCase.command, availability(runtimeCase.command)]]),
          () => 'sandbox_unused_after_restart',
        )
        const persisted = restarted.getExecution(success.executionId)
        expect(persisted?.result.status).toBe('passed')
        expect(persisted?.result.stdout).toContain(runtimeCase.successOutput)
        expect(persisted?.result.stdout).not.toContain('sandbox-final-secret')

        expect(restarted.listExecutions().executions.length).toBeGreaterThanOrEqual(3)
      },
      30_000,
    )
  }

  it('cancels a real active execution and persists the cancelled terminal result', async () => {
    const workspaceRoot = await createWorkspace()
    const service = createService(
      workspaceRoot,
      new Map([['node', availability('node')]]),
      () => 'sandbox_final_cancel',
    )

    const execution = service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: "setInterval(() => console.log('sandbox-final-cancel-tick'), 1000)",
        limits: { timeoutMs: 5_000, maxOutputBytes: 1_024 },
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    await new Promise((resolve) => setTimeout(resolve, 100))
    const cancellation = await service.cancelExecution('sandbox_final_cancel')
    const result = await execution

    expect(cancellation.ok).toBe(true)
    expect(cancellation.status).toBe('cancelled')
    expect(result.status).toBe('cancelled')
    expect(result.cleanup).toEqual({ attempted: true, succeeded: true })

    const restarted = createService(
      workspaceRoot,
      new Map([['node', availability('node')]]),
      () => 'sandbox_unused_cancel_restart',
    )
    expect(restarted.getExecution('sandbox_final_cancel')?.result.status).toBe('cancelled')
  }, 10_000)
})
