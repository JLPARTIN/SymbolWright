import { execFileSync, spawnSync } from 'node:child_process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runDockerSmoke, runNpmPackSmoke } from './artifact-smoke.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}))

const execFileSyncMock = vi.mocked(execFileSync)
const spawnSyncMock = vi.mocked(spawnSync)

function spawnResult(
  status: number,
  options: { readonly stdout?: string; readonly stderr?: string } = {},
): ReturnType<typeof spawnSync> {
  return {
    pid: 1,
    output: [],
    stdout: options.stdout ?? '',
    stderr: options.stderr ?? '',
    status,
    signal: null,
    error: undefined,
  } as unknown as ReturnType<typeof spawnSync>
}

interface SuccessfulCommandOptions {
  readonly dockerUid?: string
  readonly opensslStatus?: number
  readonly runningState?: string
  readonly exitCode?: string
}

function installSuccessfulCommandMocks(options: SuccessfulCommandOptions = {}): void {
  const dockerUid = options.dockerUid ?? '1001'
  const opensslStatus = options.opensslStatus ?? 0
  const runningState = options.runningState ?? 'false'
  const exitCode = options.exitCode ?? '0'

  spawnSyncMock.mockImplementation((command, args) => {
    const argv = Array.isArray(args) ? args.map(String) : []
    if (command === 'docker' && argv[0] === '--version') return spawnResult(0)
    if (command === 'openssl' && argv[0] === 'version') return spawnResult(opensslStatus)
    if (command === 'docker' && argv[0] === 'logs') {
      return spawnResult(0, { stdout: 'captured container log\n' })
    }
    return spawnResult(0)
  })

  execFileSyncMock.mockImplementation((command, args) => {
    const argv = Array.isArray(args) ? args.map(String) : []
    if (command === 'npm' && argv[0] === 'pack') {
      return JSON.stringify([{ filename: 'symbolwright-test.tgz' }])
    }
    if (command === process.execPath) return '43123'
    if (command === 'docker' && argv[0] === 'exec' && argv.includes('id')) return dockerUid
    if (command === 'docker' && argv[0] === 'inspect' && argv.includes('{{.State.Running}}')) {
      return runningState
    }
    if (command === 'docker' && argv[0] === 'inspect' && argv.includes('{{.State.ExitCode}}')) {
      return exitCode
    }
    return ''
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE']
})

afterEach(() => {
  delete process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE']
})

describe('runNpmPackSmoke', () => {
  it('packs, installs, and invokes every canonical and compatibility binary', () => {
    installSuccessfulCommandMocks()

    const result = runNpmPackSmoke(process.cwd())

    expect(result.status).toBe('PASS')
    expect(result.detail).toContain('Packed tarball installed')
    const invocations = execFileSyncMock.mock.calls.map(([command, args]) => ({
      command: String(command),
      args: Array.isArray(args) ? args.map(String) : [],
    }))
    expect(invocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'npm', args: expect.arrayContaining(['pack', '--json']) }),
        expect.objectContaining({ command: 'npm', args: expect.arrayContaining(['install']) }),
        expect.objectContaining({ args: ['--help'] }),
        expect.objectContaining({ args: ['--json'] }),
      ]),
    )
  })

  it('returns an Error message when package creation fails', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('pack failed')
    })

    expect(runNpmPackSmoke(process.cwd())).toEqual({ status: 'FAIL', detail: 'pack failed' })
  })

  it('stringifies non-Error failures', () => {
    execFileSyncMock.mockImplementation(() => {
      throw 'non-error failure'
    })

    expect(runNpmPackSmoke(process.cwd())).toEqual({
      status: 'FAIL',
      detail: 'non-error failure',
    })
  })
})

describe('runDockerSmoke', () => {
  it('skips unavailable Docker outside strict release CI', () => {
    spawnSyncMock.mockReturnValue(spawnResult(1))

    expect(runDockerSmoke(process.cwd())).toEqual({
      status: 'SKIP',
      detail: 'Docker unavailable; smoke skipped outside strict release CI.',
    })
  })

  it('fails closed when Docker is required but unavailable', () => {
    process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE'] = '1'
    spawnSyncMock.mockReturnValue(spawnResult(1))

    expect(runDockerSmoke(process.cwd())).toEqual({
      status: 'FAIL',
      detail: 'Docker is required but unavailable.',
    })
  })

  it('runs local and hosted profiles against an existing immutable image', () => {
    installSuccessfulCommandMocks()

    const result = runDockerSmoke(process.cwd(), 'ghcr.io/example/symbolwright@sha256:abc')

    expect(result.status).toBe('PASS')
    expect(result.detail).toContain('hosted TLS profiles passed')
    expect(execFileSyncMock).not.toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['build']),
      expect.anything(),
    )
    expect(spawnSyncMock).not.toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['image', 'rm']),
      expect.anything(),
    )
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'curl',
      expect.arrayContaining(['Authorization: Bearer release-smoke-key']),
      expect.anything(),
    )
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['SYMBOLWRIGHT_DEPLOYMENT_MODE=local']),
      expect.anything(),
    )
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['SYMBOLWRIGHT_DEPLOYMENT_MODE=hosted']),
      expect.anything(),
    )
  })

  it('builds and removes a temporary image when no image override is supplied', () => {
    installSuccessfulCommandMocks()

    expect(runDockerSmoke(process.cwd()).status).toBe('PASS')
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['build', '--tag']),
      expect.objectContaining({ cwd: process.cwd() }),
    )
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['image', 'rm', '-f']),
      expect.objectContaining({ stdio: 'ignore' }),
    )
  })

  it('rejects a root container and includes captured startup logs', () => {
    installSuccessfulCommandMocks({ dockerUid: '0' })

    const result = runDockerSmoke(process.cwd(), 'symbolwright:test')

    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('Container runs as root.')
    expect(result.detail).toContain('captured container log')
  })

  it('fails the hosted profile when OpenSSL is unavailable', () => {
    installSuccessfulCommandMocks({ opensslStatus: 1 })

    const result = runDockerSmoke(process.cwd(), 'symbolwright:test')

    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('openssl is required for hosted Docker smoke')
  })

  it('fails when graceful shutdown does not stop the container', () => {
    installSuccessfulCommandMocks({ runningState: 'true' })
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(20_000)
      .mockReturnValue(20_000)

    const result = runDockerSmoke(process.cwd(), 'symbolwright:test')

    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('Container did not stop after SIGTERM')
    vi.restoreAllMocks()
  })

  it('fails when the container exits non-zero after SIGTERM', () => {
    installSuccessfulCommandMocks({ exitCode: '7' })

    const result = runDockerSmoke(process.cwd(), 'symbolwright:test')

    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('Container exited non-zero after SIGTERM')
  })
})
