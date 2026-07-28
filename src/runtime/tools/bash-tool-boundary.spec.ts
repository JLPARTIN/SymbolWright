import { describe, expect, it } from 'vitest'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../../access/sandbox-capabilities.js'
import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import {
  DEFAULT_TIMEOUT_MS,
  type SandboxCommandRequest,
  type SandboxRunner,
  type SandboxRunnerResult,
} from '../sandbox/sandbox-runner.js'
import type { RuntimeToolContext } from '../types.js'
import { bashTool, executeBashTool } from './bash-tool.js'

function capturingRunner(
  captured: SandboxCommandRequest[],
  result: Partial<SandboxRunnerResult> = {},
): SandboxRunner {
  return {
    runCommand: async (request): Promise<SandboxRunnerResult> => {
      captured.push(request)
      return {
        outcome: 'EXECUTED',
        runner: 'docker',
        command: [request.binary, ...request.args].join(' '),
        stdout: '',
        stderr: '',
        exitCode: 0,
        reason: null,
        ...result,
      }
    },
  }
}

function context(runner: SandboxRunner, untrustedRepositoryContent = false): RuntimeToolContext {
  return {
    cwd: '/workspace/repository',
    policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
    sessionId: 'session-1',
    sandboxRunner: runner,
    untrustedRepositoryContent,
    sandboxAuthorization: {
      deploymentMode: 'local',
      callerKind: 'system',
      runtimeMode: 'APPROVED_EXECUTION',
      approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
      repositoryId: 'repository-1',
      workspaceId: 'workspace-1',
      intent: 'offline-execution',
    },
  }
}

describe('bash tool boundary hardening', () => {
  it('caps caller timeout overrides at the server maximum', async () => {
    const captured: SandboxCommandRequest[] = []
    await executeBashTool(
      { command: 'node --version', timeoutMs: DEFAULT_TIMEOUT_MS * 10 },
      process.cwd(),
      true,
      capturingRunner(captured),
    )
    expect(captured[0]?.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    'drops invalid timeout override %s instead of widening execution',
    async (timeoutMs) => {
      const captured: SandboxCommandRequest[] = []
      await executeBashTool(
        { command: 'node --version', timeoutMs },
        process.cwd(),
        true,
        capturingRunner(captured),
      )
      expect(captured[0]?.timeoutMs).toBeUndefined()
    },
  )

  it('omits an absent timeout and renders policy evidence plus bounded output', async () => {
    const captured: SandboxCommandRequest[] = []
    const rendered = await executeBashTool(
      { command: 'npm run test' },
      '/workspace/repository',
      true,
      capturingRunner(captured, {
        outcome: 'BLOCKED',
        stdout: 'partial stdout',
        stderr: 'bounded stderr',
        exitCode: null,
        reason: 'Sandbox output limit exceeded.',
        reasonCode: 'SANDBOX_COMMAND_OUTPUT_LIMIT',
        policy: { fingerprint: 'a'.repeat(64) } as SandboxRunnerResult['policy'],
      }),
    )

    expect(captured[0]).toMatchObject({
      workspaceRoot: '/workspace/repository',
      binary: 'npm',
      args: ['run', 'test'],
      workspaceTrust: 'trusted-local',
    })
    expect(captured[0]).not.toHaveProperty('timeoutMs')
    expect(rendered).toContain('Status: BLOCKED')
    expect(rendered).toContain('Reason: Sandbox output limit exceeded.')
    expect(rendered).toContain('Decision: SANDBOX_COMMAND_OUTPUT_LIMIT')
    expect(rendered).toContain(`Policy fingerprint: ${'a'.repeat(64)}`)
    expect(rendered).toContain('stdout:\npartial stdout')
    expect(rendered).toContain('stderr:\nbounded stderr')
  })

  it('blocks execution when shell policy is disabled', async () => {
    const captured: SandboxCommandRequest[] = []
    const rendered = await executeBashTool(
      { command: 'npm test' },
      '/workspace/repository',
      false,
      capturingRunner(captured),
    )

    expect(rendered).toContain('Status: BLOCKED')
    expect(rendered).toContain('Shell execution is not allowed')
    expect(captured).toEqual([])
  })

  it('blocks binaries outside the runtime command allowlist before invoking a runner', async () => {
    const captured: SandboxCommandRequest[] = []
    const rendered = await executeBashTool(
      { command: 'python script.py' },
      '/workspace/repository',
      true,
      capturingRunner(captured),
    )

    expect(rendered).toContain('Status: BLOCKED')
    expect(rendered).toContain('binary is not allowed')
    expect(captured).toEqual([])
  })

  it('passes exact authorization and external-untrusted classification to the runner', async () => {
    const captured: SandboxCommandRequest[] = []
    const toolContext = context(capturingRunner(captured), true)

    await bashTool.execute({ command: 'npm test', timeoutMs: 1234 }, toolContext)

    expect(captured[0]).toMatchObject({
      workspaceRoot: '/workspace/repository',
      binary: 'npm',
      args: ['test'],
      timeoutMs: 1234,
      workspaceTrust: 'external-untrusted',
      authorization: toolContext.sandboxAuthorization,
    })
  })

  it('defaults omitted input timeout and trusted workspace classification through the tool', async () => {
    const captured: SandboxCommandRequest[] = []

    await bashTool.execute({ command: 'node --version', timeoutMs: 'ignored' }, context(capturingRunner(captured)))

    expect(captured[0]?.workspaceTrust).toBe('trusted-local')
    expect(captured[0]?.timeoutMs).toBeUndefined()
  })

  it.each([
    [null, 'Missing command'],
    [{}, 'Missing command'],
    [{ command: 42 }, 'command must be a non-empty string'],
    [{ command: '   ' }, 'command must be a non-empty string'],
  ])('rejects malformed tool input %#', async (input, message) => {
    await expect(bashTool.execute(input, context(capturingRunner([])))).rejects.toThrow(message)
  })
})
