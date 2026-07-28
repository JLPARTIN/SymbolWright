import { describe, expect, it, vi } from 'vitest'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import type { SandboxRunner, SandboxFileWriter } from '../sandbox/sandbox-command-backend.js'
import type { SandboxService } from '../sandbox/sandbox-service.js'
import { buildChildContext } from './subagent-dispatcher.js'

function parentContext(): RuntimeToolContext {
  const sandboxRunner = {} as SandboxRunner
  const sandboxFileWriter = {} as SandboxFileWriter
  const sandboxService = {} as SandboxService
  const recordSandboxExecution = vi.fn()
  const requireAuthorized = vi.fn(async () => undefined)

  return {
    cwd: '/workspace/external-repository',
    policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
    sessionId: 'parent-session',
    untrustedRepositoryContent: true,
    sandboxRunner,
    sandboxFileWriter,
    sandboxService,
    sandboxAuthorization: {
      deploymentMode: 'local',
      callerKind: 'delegated-grant',
      runtimeMode: 'APPROVED_EXECUTION',
      approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
      repositoryId: 'repository-1',
      workspaceId: 'workspace-1',
      grantId: 'grant-1',
      principalId: 'principal-1',
      grantAllowedCommands: ['npm run test'],
      intent: 'offline-execution',
    },
    recordSandboxExecution,
    accessControl: {
      principalId: 'principal-1',
      grantId: 'grant-1',
      requireAuthorized,
    },
  }
}

describe('subagent sandbox authority propagation', () => {
  it('preserves exact parent execution authority for an explicitly governed child', () => {
    const parent = parentContext()
    const child = buildChildContext(parent, 'child-session', true)

    expect(child.policy).toBe(parent.policy)
    expect(child.sessionId).toBe('child-session')
    expect(child.untrustedRepositoryContent).toBe(true)
    expect(child.sandboxRunner).toBe(parent.sandboxRunner)
    expect(child.sandboxFileWriter).toBe(parent.sandboxFileWriter)
    expect(child.sandboxService).toBe(parent.sandboxService)
    expect(child.sandboxAuthorization).toBe(parent.sandboxAuthorization)
    expect(child.recordSandboxExecution).toBe(parent.recordSandboxExecution)
    expect(child.accessControl).toBe(parent.accessControl)
  })

  it('strips governed execution adapters and grant hooks from a read-only child', () => {
    const parent = parentContext()
    const child = buildChildContext(parent, 'child-session', false)

    expect(child.policy.mode).toBe('READ_ONLY')
    expect(child.policy.allowShell).toBe(false)
    expect(child.policy.allowWrites).toBe(false)
    expect(child.untrustedRepositoryContent).toBe(true)
    expect(child).not.toHaveProperty('sandboxRunner')
    expect(child).not.toHaveProperty('sandboxFileWriter')
    expect(child).not.toHaveProperty('sandboxService')
    expect(child).not.toHaveProperty('sandboxAuthorization')
    expect(child).not.toHaveProperty('recordSandboxExecution')
    expect(child).not.toHaveProperty('accessControl')
  })
})
