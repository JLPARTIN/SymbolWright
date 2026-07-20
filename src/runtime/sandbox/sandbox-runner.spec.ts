import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SANDBOX_USER,
  DockerSandboxFileWriter,
  DockerSandboxRunner,
  buildDockerFileWriteArgs,
  buildDockerRunArgs,
  parseWorkspaceCommand,
  renderDockerSandboxConfig,
  resolveDefaultSandboxUser,
  resolveDockerSandboxConfig,
  resolveDockerSandboxRunnerOptionsFromEnv,
} from './sandbox-runner.js'

describe('parseWorkspaceCommand', () => {
  it('accepts parameterized workspace commands for allowed binaries', () => {
    expect(parseWorkspaceCommand('npm test')).toEqual({ binary: 'npm', args: ['test'] })
    expect(parseWorkspaceCommand('git status --short')).toEqual({
      binary: 'git',
      args: ['status', '--short'],
    })
  })

  it('rejects unsupported binaries', () => {
    expect(() => parseWorkspaceCommand('python script.py')).toThrow(
      'Sandbox command binary is not allowed',
    )
  })

  it('rejects shell metacharacters before the command reaches Docker', () => {
    expect(() => parseWorkspaceCommand('npm test && echo nope')).toThrow('shell metacharacters')
    expect(() => parseWorkspaceCommand('git status | echo nope')).toThrow('shell metacharacters')
  })
})

describe('resolveDefaultSandboxUser', () => {
  it('matches the host UID:GID on POSIX hosts', () => {
    expect(resolveDefaultSandboxUser()).toBe(`${process.getuid?.()}:${process.getgid?.()}`)
  })

  it('falls back to DEFAULT_SANDBOX_USER when getuid/getgid are unavailable', () => {
    const originalGetuid = process.getuid
    // Simulating a non-POSIX host for this test only
    delete process.getuid
    try {
      expect(resolveDefaultSandboxUser()).toBe(DEFAULT_SANDBOX_USER)
    } finally {
      if (originalGetuid !== undefined) {
        process.getuid = originalGetuid
      }
    }
  })
})

describe('Docker sandbox configuration', () => {
  it('resolves defaults', () => {
    const config = resolveDockerSandboxConfig({})

    expect(config.dockerBinary).toBe('docker')
    expect(config.image).toBe('node:22-bookworm')
    expect(config.memory).toBe('2048m')
    expect(config.cpus).toBe('1')
    expect(config.network).toBe('none')
    expect(config.user).toBe(resolveDefaultSandboxUser())
    expect(config.timeoutMs).toBe(120_000)
    expect(config.maxOutputBytes).toBe(1024 * 1024)
  })

  it('resolves options from environment variables', () => {
    const options = resolveDockerSandboxRunnerOptionsFromEnv({
      CODEMIND_SANDBOX_DOCKER_BINARY: 'podman',
      CODEMIND_SANDBOX_IMAGE: 'node:22-bookworm-slim',
      CODEMIND_SANDBOX_MEMORY: '768m',
      CODEMIND_SANDBOX_CPUS: '2',
      CODEMIND_SANDBOX_USER: '1000:1000',
      CODEMIND_SANDBOX_NETWORK: 'none',
      CODEMIND_SANDBOX_TIMEOUT_MS: '90000',
      CODEMIND_SANDBOX_MAX_OUTPUT_BYTES: '2048',
    })
    const config = resolveDockerSandboxConfig(options)

    expect(config.dockerBinary).toBe('podman')
    expect(config.image).toBe('node:22-bookworm-slim')
    expect(config.memory).toBe('768m')
    expect(config.cpus).toBe('2')
    expect(config.user).toBe('1000:1000')
    expect(config.network).toBe('none')
    expect(config.timeoutMs).toBe(90_000)
    expect(config.maxOutputBytes).toBe(2048)
  })

  it('ignores invalid integer environment values', () => {
    const options = resolveDockerSandboxRunnerOptionsFromEnv({
      CODEMIND_SANDBOX_TIMEOUT_MS: 'not-a-number',
      CODEMIND_SANDBOX_MAX_OUTPUT_BYTES: '-1',
    })
    const config = resolveDockerSandboxConfig(options)

    expect(config.timeoutMs).toBe(120_000)
    expect(config.maxOutputBytes).toBe(1024 * 1024)
  })

  it('renders operator-readable config', () => {
    const output = renderDockerSandboxConfig(
      resolveDockerSandboxConfig({ image: 'node:22-alpine', memory: '1g', cpus: '2' }),
    )

    expect(output).toContain('image=node:22-alpine')
    expect(output).toContain('memory=1g')
    expect(output).toContain('cpus=2')
    expect(output).toContain('network=none')
  })
})

describe('Docker sandbox command construction', () => {
  it('builds an isolated container command', () => {
    const args = buildDockerRunArgs({
      workspaceRoot: '/tmp/codemind-workspace',
      binary: 'npm',
      args: ['test'],
    })

    expect(args).toContain('--cap-drop=ALL')
    expect(args).toContain('--security-opt=no-new-privileges:true')
    expect(args).toContain('--network')
    expect(args).toContain('none')
    expect(args).toContain('--memory')
    expect(args).toContain('2048m')
    expect(args).toContain('--cpus')
    expect(args).toContain('1')
    expect(args).toContain('--user')
    expect(args).toContain(resolveDefaultSandboxUser())
    expect(args).toContain('--env')
    expect(args).toContain('HOME=/workspace')
    expect(args).toContain('/tmp/codemind-workspace:/workspace:rw')
    expect(args.slice(-2)).toEqual(['npm', 'test'])
  })

  it('applies configured Docker resource values', () => {
    const args = buildDockerRunArgs(
      {
        workspaceRoot: '/tmp/codemind-workspace',
        binary: 'npm',
        args: ['test'],
      },
      {
        dockerBinary: 'docker',
        image: 'node:22-bookworm-slim',
        memory: '1g',
        cpus: '2',
        user: '1000:1000',
      },
    )

    expect(args).toContain('node:22-bookworm-slim')
    expect(args).toContain('1g')
    expect(args).toContain('2')
    expect(args).toContain('1000:1000')
  })

  it('builds file writes as parameterized node execution, not shell execution', () => {
    const args = buildDockerFileWriteArgs({
      workspaceRoot: '/tmp/codemind-workspace',
      targetPath: 'src/output.ts',
      content: 'export {}',
    })

    expect(args).toContain('--cap-drop=ALL')
    expect(args).toContain('--security-opt=no-new-privileges:true')
    expect(args).toContain('--network')
    expect(args).toContain('none')
    expect(args).toContain('node')
    expect(args).toContain('-e')
    expect(args).toContain('src/output.ts')
    expect(args).not.toContain('bash')
    expect(args).not.toContain('-c')
  })
})

describe('Docker sandbox fail-closed behavior', () => {
  it('does not fall back to host execution when Docker is unavailable', async () => {
    const runner = new DockerSandboxRunner({ dockerBinary: 'definitely-not-codemind-docker' })
    const result = await runner.runCommand({
      workspaceRoot: '/tmp/codemind-workspace',
      binary: 'npm',
      args: ['test'],
    })

    expect(result.outcome).toBe('BLOCKED')
    expect(result.reason).toContain('host execution is not allowed')
  })

  it('does not fall back to host file writes when Docker is unavailable', () => {
    const writer = new DockerSandboxFileWriter({ dockerBinary: 'definitely-not-codemind-docker' })
    const result = writer.writeFile({
      workspaceRoot: '/tmp/codemind-workspace',
      targetPath: 'src/output.ts',
      content: 'export {}',
    })

    expect(result.outcome).toBe('BLOCKED')
    expect(result.reason).toContain('host file writes are not allowed')
  })
})
