import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runContainerSecretScan } from './secret-scan.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}))

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')

const execFileSyncMock = vi.mocked(execFileSync)
const spawnSyncMock = vi.mocked(spawnSync)

function spawnResult(status: number): ReturnType<typeof spawnSync> {
  return {
    pid: 1,
    output: [],
    stdout: '',
    stderr: '',
    status,
    signal: null,
    error: undefined,
  } as unknown as ReturnType<typeof spawnSync>
}

/**
 * Docker's real presence is not portable across environments -- this sandbox has no Docker
 * daemon, but CI runners commonly do -- so, matching the existing `artifact-smoke.spec.ts`
 * convention for Docker-dependent tests, `node:child_process` is fully mocked rather than relying
 * on the ambient environment.
 */
beforeEach(() => {
  vi.clearAllMocks()
  delete process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE']
})

afterEach(() => {
  delete process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE']
})

describe('runContainerSecretScan', () => {
  it('reports BLOCKED when Docker is unavailable', () => {
    spawnSyncMock.mockReturnValue(spawnResult(1))

    const result = runContainerSecretScan(REPO_ROOT)

    expect(result.status).toBe('BLOCKED')
    expect(result.detail).toContain('Docker is unavailable')
  })

  it('fails closed when Docker is required but unavailable', () => {
    process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE'] = '1'
    spawnSyncMock.mockReturnValue(spawnResult(1))

    const result = runContainerSecretScan(REPO_ROOT)

    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('Docker is unavailable')
  })

  it('builds, exports, and scans the container filesystem, excluding symlinks and .map files, passing when clean', () => {
    spawnSyncMock.mockReturnValue(spawnResult(0))
    execFileSyncMock.mockImplementation((command, args) => {
      const argv = Array.isArray(args) ? args.map(String) : []
      if (command === 'tar' && argv[0] === 'xf') {
        const extractedDir = String(argv[3])
        const appDir = path.join(extractedDir, 'app')
        fs.mkdirSync(appDir, { recursive: true })
        fs.writeFileSync(path.join(appDir, 'clean.txt'), 'ok\n')
        fs.writeFileSync(path.join(appDir, 'clean.js.map'), '{}')
        fs.symlinkSync(path.join(appDir, 'clean.txt'), path.join(appDir, 'link.txt'))
        return ''
      }
      if (command === 'docker' && argv[0] === 'export') return Buffer.from('fake-tar-data')
      return ''
    })

    const result = runContainerSecretScan(REPO_ROOT)

    expect(result.status).toBe('PASS')
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['build', '--tag']),
      expect.objectContaining({ cwd: REPO_ROOT }),
    )
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['rm', '-f']),
      expect.objectContaining({ stdio: 'ignore' }),
    )
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['image', 'rm', '-f']),
      expect.objectContaining({ stdio: 'ignore' }),
    )
  })

  it('skips the build step and reuses an explicit image override', () => {
    spawnSyncMock.mockReturnValue(spawnResult(0))
    execFileSyncMock.mockImplementation((command, args) => {
      const argv = Array.isArray(args) ? args.map(String) : []
      if (command === 'tar' && argv[0] === 'xf') {
        const extractedDir = String(argv[3])
        fs.writeFileSync(path.join(extractedDir, 'clean.txt'), 'ok\n')
        return ''
      }
      if (command === 'docker' && argv[0] === 'export') return Buffer.from('fake-tar-data')
      return ''
    })

    const result = runContainerSecretScan(REPO_ROOT, 'symbolwright:pinned')

    expect(result.status).toBe('PASS')
    expect(execFileSyncMock).not.toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['build']),
      expect.anything(),
    )
    expect(spawnSyncMock).not.toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['image', 'rm', '-f']),
      expect.objectContaining({ stdio: 'ignore' }),
    )
  })

  it('reports FAIL when the build/export/scan pipeline throws', () => {
    spawnSyncMock.mockReturnValue(spawnResult(0))
    execFileSyncMock.mockImplementation((command, args) => {
      const argv = Array.isArray(args) ? args.map(String) : []
      if (command === 'docker' && argv[0] === 'build') throw new Error('build failed')
      return ''
    })

    const result = runContainerSecretScan(REPO_ROOT)

    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('build failed')
  })
})
