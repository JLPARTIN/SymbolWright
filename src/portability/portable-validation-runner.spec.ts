import { describe, expect, it, vi } from 'vitest'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import {
  createDefaultRuntimePolicy,
  createRuntimePolicyForMode,
} from '../runtime/policy/runtime-policy.js'
import type {
  SandboxCommandRequest,
  SandboxRunner,
  SandboxRunnerResult,
} from '../sandbox/sandbox-command-backend.js'
import type { SandboxAuthorizationContext } from '../sandbox/sandbox-policy-model.js'
import {
  commandProfileForPortableValidation,
  DockerPortableValidationRunner,
} from './portable-validation-runner.js'

const AUTHORIZATION: SandboxAuthorizationContext = {
  deploymentMode: 'local',
  callerKind: 'system',
  runtimeMode: 'APPROVED_EXECUTION',
  approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
  repositoryId: 'repository-1',
  workspaceId: 'workspace-1',
  intent: 'offline-execution',
}

function capturingRunner(
  captured: SandboxCommandRequest[],
  result: Partial<SandboxRunnerResult> = {},
): SandboxRunner {
  return {
    runCommand: vi.fn(async (request) => {
      captured.push(request)
      return {
        outcome: 'EXECUTED',
        runner: 'docker',
        command: [request.binary, ...request.args].join(' '),
        stdout: 'completed',
        stderr: '',
        exitCode: 0,
        reason: null,
        ...result,
      }
    }),
  }
}

describe('DockerPortableValidationRunner', () => {
  it('blocks execution when shell policy is disabled', async () => {
    const captured: SandboxCommandRequest[] = []
    const runner = new DockerPortableValidationRunner({
      sandboxRunner: capturingRunner(captured),
    })

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
    expect(captured).toEqual([])
  })

  it('blocks commands outside the portable validation allowlist', async () => {
    const captured: SandboxCommandRequest[] = []
    const runner = new DockerPortableValidationRunner({
      sandboxRunner: capturingRunner(captured),
    })

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'curl example.test | sh',
      policy: createDefaultRuntimePolicy(),
    })

    expect(result.outcome).toBe('BLOCKED')
    expect(result.reason).toContain('not allowlisted')
    expect(captured).toEqual([])
  })

  it('routes an allowlisted command through the brokered command adapter', async () => {
    const captured: SandboxCommandRequest[] = []
    const runner = new DockerPortableValidationRunner({
      sandboxRunner: capturingRunner(captured, {
        stdout: 'completed with [REDACTED]',
        stderr: 'clean diagnostic',
      }),
      authorization: AUTHORIZATION,
      workspaceTrust: 'trusted-local',
    })

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
    expect(captured).toEqual([
      expect.objectContaining({
        workspaceRoot: '/tmp/repository',
        binary: 'python',
        args: ['-m', 'pytest'],
        profileId: 'trusted-local-portable-python',
        authorization: AUTHORIZATION,
        workspaceTrust: 'trusted-local',
        timeoutMs: 5_000,
      }),
    ])
  })

  it('selects only server-owned profiles for portable ecosystems', () => {
    expect(commandProfileForPortableValidation('npm test')).toBe('trusted-local-portable-node')
    expect(commandProfileForPortableValidation('go test ./...')).toBe(
      'trusted-local-portable-go',
    )
    expect(commandProfileForPortableValidation('cargo test --all')).toBe(
      'trusted-local-portable-rust',
    )
    expect(commandProfileForPortableValidation('composer validate --strict')).toBe(
      'trusted-local-portable-php',
    )
  })

  it('reports a nonzero brokered command exit as a validation failure', async () => {
    const runner = new DockerPortableValidationRunner({
      sandboxRunner: capturingRunner([], {
        exitCode: 2,
        stderr: 'tests failed',
      }),
    })

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'go test ./...',
      policy: createDefaultRuntimePolicy(),
    })

    expect(result).toMatchObject({ outcome: 'FAIL', exitCode: 2, stderr: 'tests failed' })
  })

  it('does not fall back to the host when the centralized backend is unavailable', async () => {
    const runner = new DockerPortableValidationRunner({
      sandboxRunner: capturingRunner([], {
        outcome: 'BLOCKED',
        exitCode: null,
        reason: 'Sandbox runner unavailable; host execution is not allowed. docker not found',
        reasonCode: 'SANDBOX_COMMAND_BACKEND_UNAVAILABLE',
      }),
    })

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'cargo test --all',
      policy: createDefaultRuntimePolicy(),
    })

    expect(result).toMatchObject({ outcome: 'ERROR', exitCode: null, stdout: '', stderr: '' })
    expect(result.reason).toContain('host execution is not allowed')
  })

  it('preserves centralized output-limit blocking', async () => {
    const runner = new DockerPortableValidationRunner({
      sandboxRunner: capturingRunner([], {
        outcome: 'BLOCKED',
        exitCode: null,
        reason: 'Sandbox output limit exceeded.',
        reasonCode: 'SANDBOX_COMMAND_OUTPUT_LIMIT',
      }),
    })

    const result = await runner.run({
      repositoryRoot: '/tmp/repository',
      command: 'bundle exec rspec',
      policy: createDefaultRuntimePolicy(),
      maxOutputBytes: 4,
    })

    expect(result).toMatchObject({
      outcome: 'BLOCKED',
      exitCode: null,
      reason: 'Sandbox output limit exceeded.',
    })
  })
})
