import { describe, expect, it } from 'vitest'

import {
  DockerSandboxFileWriter,
  DockerSandboxRunner,
  buildDockerFileWriteArgs,
  buildDockerRunArgs,
  parseWorkspaceCommand,
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

describe('Docker sandbox command construction', () => {
  it('builds a no-network, no-new-privileges, capability-dropped container command', () => {
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
    expect(args).toContain('512m')
    expect(args).toContain('--cpus')
    expect(args).toContain('1')
    expect(args).toContain('--user')
    expect(args).toContain('node')
    expect(args).toContain('/tmp/codemind-workspace:/workspace:rw')
    expect(args.slice(-2)).toEqual(['npm', 'test'])
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
