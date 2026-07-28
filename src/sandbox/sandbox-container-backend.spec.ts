import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  executeStrongSandboxContainer,
  reapStrongSandboxOrphans,
  type ExecuteStrongSandboxContainerInput,
} from './sandbox-container-backend.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import {
  buildSandboxInventory,
  runnerAvailability,
  STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
} from './sandbox-registry.js'
import type {
  SandboxExecutionRequest,
  SandboxImageDefinition,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

const CHECKED_AT = '2026-07-28T00:00:00.000Z'
const STARTED_AT = '2026-07-28T00:00:00.000Z'
const COMPLETED_AT = '2026-07-28T00:00:01.000Z'

interface FakeEngineConfig {
  readonly failStage?: 'inspect' | 'create' | 'start' | 'copy-in' | 'copy-out' | 'remove'
  readonly digestMatches?: boolean
  readonly execution?: {
    readonly exitCode?: number
    readonly stdout?: string
    readonly stderr?: string
    readonly sleepMs?: number
    readonly floodBytes?: number
  }
  readonly copyOut?: 'state' | 'invalid'
  readonly psExitCode?: number
  readonly psOutput?: string
  readonly removalFailures?: readonly string[]
}

interface Fixture {
  readonly root: string
  readonly env: NodeJS.ProcessEnv
  readonly runner: SandboxRunnerDefinition
  readonly image: SandboxImageDefinition
  readonly engine: SandboxContainerEngineStatus
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(config: FakeEngineConfig = {}): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-backend-unit-'))
  roots.push(root)
  const bin = path.join(root, 'bin')
  const state = path.join(root, 'workspace.json')
  await writeFile(path.join(root, '.keep'), '')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(bin, { recursive: true }))

  const script = `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const config = ${JSON.stringify(config)}
const statePath = ${JSON.stringify(state)}
const digest = 'sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66'
const exit = (code, stdout = '', stderr = '') => {
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  process.exit(code)
}
const readStdin = (callback) => {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => callback(input))
}
if (args[0] === 'image' && args[1] === 'inspect') {
  if (config.failStage === 'inspect') exit(1, '', 'image missing')
  exit(0, JSON.stringify([config.digestMatches === false ? 'node@sha256:' + '0'.repeat(64) : 'node@' + digest]))
}
if (args[0] === 'ps') exit(config.psExitCode ?? 0, config.psOutput ?? '', 'ps failed')
if (args[0] === 'create') exit(config.failStage === 'create' ? 2 : 0, '', 'create failed')
if (args[0] === 'start') exit(config.failStage === 'start' ? 2 : 0, '', 'start failed')
if (args[0] === 'kill') exit(0)
if (args[0] === 'rm') {
  const target = args.at(-1)
  const failed = config.failStage === 'remove' || (config.removalFailures ?? []).includes(target)
  exit(failed ? 2 : 0, '', failed ? 'remove failed' : '')
}
if (args[0] === 'exec') {
  const joined = args.join(' ')
  if (joined.includes('Invalid SymbolWright workspace payload.')) {
    if (config.failStage === 'copy-in') exit(2, '', 'copy-in failed')
    readStdin((input) => { fs.writeFileSync(statePath, input); exit(0) })
    return
  }
  if (joined.includes('Generated symlink rejected:')) {
    if (config.failStage === 'copy-out') exit(2, '', 'copy-out failed')
    if (config.copyOut === 'invalid') exit(0, 'not-json')
    exit(0, fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : JSON.stringify({ schemaVersion: 1, files: [] }))
  }
  const execution = config.execution ?? {}
  const finish = () => {
    if (execution.floodBytes) process.stdout.write('X'.repeat(execution.floodBytes))
    exit(execution.exitCode ?? 0, execution.stdout ?? '', execution.stderr ?? '')
  }
  if (execution.sleepMs) setTimeout(finish, execution.sleepMs)
  else finish()
  return
}
exit(0)
`
  const executable = path.join(bin, 'docker')
  await writeFile(executable, script)
  await chmod(executable, 0o755)

  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`,
    SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION: 'true',
  }
  const inventory = buildSandboxInventory({
    env,
    commandAvailability: new Map([
      ['docker', runnerAvailability('available', CHECKED_AT, { version: 'fake' })],
    ]),
  })
  const runner = inventory.runners.find(
    (candidate) => candidate.id === STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
  )
  const image = inventory.images.find((candidate) => candidate.id === runner?.container?.imageId)
  if (runner === undefined || image === undefined) throw new Error('Strong sandbox fixture unavailable')

  return {
    root,
    env,
    runner,
    image,
    engine: {
      engine: 'docker',
      status: 'available',
      version: 'fake',
      reason: 'fake Docker engine',
    },
  }
}

function input(
  value: Fixture,
  request: Partial<SandboxExecutionRequest> = {},
  overrides: Partial<ExecuteStrongSandboxContainerInput> = {},
): ExecuteStrongSandboxContainerInput {
  return {
    executionId: 'backend-unit',
    request: {
      languageId: 'javascript',
      mode: 'run',
      source: "console.log('unit')",
      ...request,
    },
    runner: value.runner,
    image: value.image,
    engine: value.engine,
    startedAt: STARTED_AT,
    now: () => new Date(COMPLETED_AT),
    env: value.env,
    stateRoot: path.join(value.root, 'state'),
    ...overrides,
  }
}

describe('strong sandbox container backend unit boundaries', () => {
  it('fails closed when no container engine is available', async () => {
    const report = await reapStrongSandboxOrphans({
      engine: 'none',
      status: 'unavailable',
      reason: 'no engine',
    })
    expect(report).toEqual({
      attempted: false,
      engine: 'none',
      removedContainerIds: [],
      warnings: ['no engine'],
    })
  })

  it('reports orphan discovery and mixed removal outcomes exactly', async () => {
    const discoveryFailure = await fixture({ psExitCode: 2 })
    const failed = await reapStrongSandboxOrphans(discoveryFailure.engine, discoveryFailure.env)
    expect(failed.attempted).toBe(true)
    expect(failed.removedContainerIds).toEqual([])
    expect(failed.warnings.join(' ')).toContain('orphan discovery failed')

    const first = 'abcdef123456'
    const second = '123456abcdef'
    const mixed = await fixture({
      psOutput: `${first}\nnot-a-container\n${second}\n`,
      removalFailures: [second],
    })
    const report = await reapStrongSandboxOrphans(mixed.engine, mixed.env)
    expect(report.removedContainerIds).toEqual([first])
    expect(report.warnings.join(' ')).toContain(second)
  })

  it('rejects runner, engine, and image authority mismatches before spawning', async () => {
    const value = await fixture()
    const { container: _container, ...withoutContainer } = value.runner
    const cases: readonly ExecuteStrongSandboxContainerInput[] = [
      input(value, {}, {
        runner: { ...value.runner, backend: 'browser', trustClass: 'browser-isolated' },
      }),
      input(value, {}, { runner: withoutContainer as SandboxRunnerDefinition }),
      input(value, {}, {
        engine: { ...value.engine, engine: 'podman' },
      }),
      input(value, {}, {
        image: { ...value.image, id: 'wrong-image' },
      }),
    ]

    for (const candidate of cases) {
      const result = await executeStrongSandboxContainer(candidate)
      expect(result.status).toBe('internal-error')
      expect(result.cleanup).toEqual({ attempted: true, succeeded: true })
      expect(result.diagnostics[0]?.severity).toBe('error')
    }
  })

  it('distinguishes missing images and digest mismatches', async () => {
    const missing = await fixture({ failStage: 'inspect' })
    const unavailable = await executeStrongSandboxContainer(input(missing))
    expect(unavailable.status).toBe('unavailable')
    expect(unavailable.stderr).toContain('image missing')
    expect(unavailable.cleanup.succeeded).toBe(true)

    const mismatch = await fixture({ digestMatches: false })
    const blocked = await executeStrongSandboxContainer(input(mismatch))
    expect(blocked.status).toBe('policy-blocked')
    expect(blocked.stderr).toContain('allowlisted digest')
  })

  it('maps successful run, compile, and test executions to verification levels', async () => {
    const value = await fixture({ execution: { stdout: 'ok' } })
    const modes = [
      ['run', 'EXECUTED'],
      ['compile', 'COMPILED'],
      ['test', 'TESTED'],
    ] as const
    for (const [mode, verificationLevel] of modes) {
      const result = await executeStrongSandboxContainer(
        input(value, { mode }, { executionId: `backend-${mode}` }),
      )
      expect(result.status).toBe('passed')
      expect(result.evidence.verificationLevel).toBe(verificationLevel)
      expect(result.cleanup).toEqual({ attempted: true, succeeded: true })
      expect(result.evidence.inputHash).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('maps runtime, compile, resource, copy-out, and cleanup failures', async () => {
    const runtime = await fixture({ execution: { exitCode: 2, stderr: 'boom' } })
    expect((await executeStrongSandboxContainer(input(runtime))).status).toBe('runtime-error')

    const compile = await fixture({ execution: { exitCode: 2, stderr: 'syntax' } })
    expect(
      (await executeStrongSandboxContainer(input(compile, { mode: 'compile' }))).status,
    ).toBe('compile-error')

    const resource = await fixture({ execution: { exitCode: 137 } })
    expect((await executeStrongSandboxContainer(input(resource))).status).toBe('resource-limit')

    const copyOut = await fixture({ failStage: 'copy-out' })
    const copyOutResult = await executeStrongSandboxContainer(input(copyOut))
    expect(copyOutResult.status).toBe('passed')
    expect(copyOutResult.diagnostics.some((entry) => entry.message.includes('copy-out failed'))).toBe(
      true,
    )

    const invalidPayload = await fixture({ copyOut: 'invalid' })
    expect((await executeStrongSandboxContainer(input(invalidPayload))).status).toBe('policy-blocked')

    const cleanup = await fixture({ failStage: 'remove' })
    const cleanupResult = await executeStrongSandboxContainer(input(cleanup))
    expect(cleanupResult.status).toBe('passed')
    expect(cleanupResult.cleanup.succeeded).toBe(false)
    expect(cleanupResult.cleanup.warning).toContain('Container removal failed')
  })

  it('enforces output limits, timeouts, and explicit cancellation', async () => {
    const flooding = await fixture({ execution: { floodBytes: 4_096, sleepMs: 5_000 } })
    const limited = await executeStrongSandboxContainer(
      input(flooding, { limits: { maxOutputBytes: 128, timeoutMs: 1_000 } }),
    )
    expect(limited.status).toBe('resource-limit')
    expect(limited.outputTruncated).toBe(true)

    const sleeping = await fixture({ execution: { sleepMs: 5_000 } })
    const timedOut = await executeStrongSandboxContainer(
      input(sleeping, { limits: { timeoutMs: 50 } }),
    )
    expect(timedOut.status).toBe('timeout')

    const cancellable = await fixture({ execution: { sleepMs: 5_000 } })
    let cancel: (() => void) | undefined
    const pending = executeStrongSandboxContainer(
      input(cancellable, { limits: { timeoutMs: 2_000 } }, {
        onStart: (controller) => {
          cancel = () => controller.cancel()
        },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 25))
    cancel?.()
    expect((await pending).status).toBe('cancelled')
  }, 15_000)
})
