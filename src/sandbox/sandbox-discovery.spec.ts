import { describe, expect, it } from 'vitest'

import {
  discoverRuntimeCommand,
  discoverRuntimeCommands,
  type SandboxSpawnSync,
} from './sandbox-discovery.js'

const NOW = '2026-07-21T00:00:00.000Z'

function atNow(): Date {
  return new Date(NOW)
}

describe('sandbox runtime discovery probes', () => {
  it('uses bounded no-shell version probes with a minimal environment', async () => {
    const calls: {
      readonly command: string
      readonly args: readonly string[]
      readonly shell: boolean
      readonly timeout: number
      readonly env: NodeJS.ProcessEnv
    }[] = []
    const spawnSync: SandboxSpawnSync = (command, args, options) => {
      calls.push({
        command,
        args,
        shell: options.shell,
        timeout: options.timeout,
        env: options.env,
      })
      return { status: 0, stdout: 'Python 3.12.4\n', stderr: '' }
    }

    const result = await discoverRuntimeCommand(
      {
        id: 'python3',
        command: 'python3',
        args: ['--version'],
        versionPattern: /Python\s+([^\s]+)/,
      },
      {
        now: atNow,
        timeoutMs: 250,
        env: { PATH: '/usr/bin', CODEMIND_API_KEY: 'do-not-pass' },
        spawnSync,
      },
    )

    expect(result).toMatchObject({
      status: 'available',
      version: '3.12.4',
      checkedAt: NOW,
    })
    expect(calls).toEqual([
      {
        command: 'python3',
        args: ['--version'],
        shell: false,
        timeout: 250,
        env: { PATH: '/usr/bin' },
      },
    ])
  })

  it('classifies missing commands as unavailable without executing repository code', async () => {
    const spawnSync: SandboxSpawnSync = () => ({
      status: null,
      error: { code: 'ENOENT', message: 'spawn missing ENOENT' },
    })

    const result = await discoverRuntimeCommand(
      { id: 'go', command: 'go', args: ['version'], versionPattern: /go version\s+go([^\s]+)/ },
      { now: atNow, spawnSync },
    )

    expect(result.status).toBe('unavailable')
    expect(result.reason).toContain('not found on PATH')
  })

  it('classifies timeouts and non-zero exits as misconfigured', async () => {
    const timedOut = await discoverRuntimeCommand(
      { id: 'rustc', command: 'rustc', args: ['--version'] },
      {
        now: atNow,
        spawnSync: () => ({ status: null, signal: 'SIGKILL' }),
      },
    )
    expect(timedOut.status).toBe('misconfigured')
    expect(timedOut.reason).toContain('timed out')

    const nonZero = await discoverRuntimeCommand(
      { id: 'javac', command: 'javac', args: ['-version'] },
      {
        now: atNow,
        spawnSync: () => ({ status: 2, stdout: '', stderr: 'bad flag' }),
      },
    )
    expect(nonZero.status).toBe('misconfigured')
    expect(nonZero.reason).toContain('exited with status 2')
  })

  it('returns a command-keyed availability map for refresh inventory plumbing', async () => {
    const result = await discoverRuntimeCommands(
      [
        {
          id: 'node',
          command: 'node',
          args: ['--version'],
          versionPattern: /v?([^\s]+)/,
        },
      ],
      {
        now: atNow,
        spawnSync: () => ({ status: 0, stdout: 'v22.0.0', stderr: '' }),
      },
    )

    expect(result.get('node')?.status).toBe('available')
    expect(result.get('node')?.version).toBe('22.0.0')
  })
})
