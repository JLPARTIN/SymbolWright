import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import { DEFAULT_EGRESS_POLICY_LIMITS } from '../../sandbox/egress-policy.js'
import {
  SANDBOX_NETWORK_POLICY_FILE_ENV,
  clearApplicationSandboxNetworkRuntimesForTests,
} from '../../sandbox/sandbox-network-runtime.js'
import type { RuntimeToolContext, RuntimeToolDefinition, ToolAccessControl } from '../types.js'
import { runAuthorizedTool } from './authorized-tool-execution.js'

function bashTool(execute: RuntimeToolDefinition['execute']): RuntimeToolDefinition {
  return {
    name: 'bash',
    description: 'test bash tool',
    capability: 'APPROVED_COMMAND',
    execute,
  }
}

function gitTool(execute: RuntimeToolDefinition['execute']): RuntimeToolDefinition {
  return {
    name: 'git',
    description: 'test git tool',
    capability: 'APPROVED_COMMAND',
    execute,
  }
}

function contextWith(accessControl: ToolAccessControl | undefined): RuntimeToolContext {
  return {
    cwd: '/tmp',
    policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
    ...(accessControl === undefined ? {} : { accessControl }),
  }
}

describe('runAuthorizedTool', () => {
  it('runs the tool directly when accessControl is absent (legacy operator, unrestricted)', async () => {
    const execute = vi.fn(async () => 'ok')
    const result = await runAuthorizedTool(
      bashTool(execute),
      { command: 'git status' },
      contextWith(undefined),
    )
    expect(result).toBe('ok')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('checks authorization before running the tool, passing the tool input as metadata', async () => {
    const requireAuthorized = vi.fn(async () => undefined)
    const execute = vi.fn(async () => 'ok')
    const accessControl: ToolAccessControl = {
      principalId: 'p1',
      grantId: 'g1',
      requireAuthorized,
    }

    const result = await runAuthorizedTool(
      bashTool(execute),
      { command: 'git status' },
      contextWith(accessControl),
    )

    expect(result).toBe('ok')
    expect(requireAuthorized).toHaveBeenCalledWith('symbolwright.sandbox.execute.offline', 'bash', {
      command: 'git status',
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('requires repo.commit.push in addition to baseline Git authority for push', async () => {
    const requireAuthorized = vi.fn(async () => undefined)
    const execute = vi.fn(async () => 'ok')
    const metadata = { operation: 'push', args: ['origin', 'agent/topic'] }

    await runAuthorizedTool(
      gitTool(execute),
      metadata,
      contextWith({ principalId: 'p1', grantId: 'g1', requireAuthorized }),
    )

    expect(requireAuthorized).toHaveBeenNthCalledWith(1, 'repo.commit.create', 'git', metadata)
    expect(requireAuthorized).toHaveBeenNthCalledWith(2, 'repo.commit.push', 'git', metadata)
    expect(execute).toHaveBeenCalledOnce()
  })

  it('requires branch and content authority for checkout_new and add', async () => {
    const requireAuthorized = vi.fn(async () => undefined)
    const execute = vi.fn(async () => 'ok')
    const accessControl: ToolAccessControl = {
      principalId: 'p1',
      grantId: 'g1',
      requireAuthorized,
    }

    await runAuthorizedTool(
      gitTool(execute),
      { operation: 'checkout_new', args: ['agent/topic'] },
      contextWith(accessControl),
    )
    await runAuthorizedTool(
      gitTool(execute),
      { operation: 'add', args: ['src/file.ts'] },
      contextWith(accessControl),
    )

    expect(requireAuthorized).toHaveBeenCalledWith(
      'repo.branch.create',
      'git',
      expect.objectContaining({ operation: 'checkout_new' }),
    )
    expect(requireAuthorized).toHaveBeenCalledWith(
      'repo.content.update',
      'git',
      expect.objectContaining({ operation: 'add' }),
    )
  })

  it('does not run the tool when requireAuthorized rejects', async () => {
    const requireAuthorized = vi.fn(async () => {
      throw new Error('authorization_denied[COMMAND_NOT_ALLOWED]: nope')
    })
    const execute = vi.fn(async () => 'ok')
    const accessControl: ToolAccessControl = {
      principalId: 'p1',
      grantId: 'g1',
      requireAuthorized,
    }

    await expect(
      runAuthorizedTool(
        bashTool(execute),
        { command: 'curl evil.example' },
        contextWith(accessControl),
      ),
    ).rejects.toThrow('COMMAND_NOT_ALLOWED')
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not run git push when push-specific authority is denied', async () => {
    const requireAuthorized = vi.fn(async (capability: string) => {
      if (capability === 'repo.commit.push') {
        throw new Error('authorization_denied[DIRECT_PUSH_DISABLED]: nope')
      }
    })
    const execute = vi.fn(async () => 'ok')

    await expect(
      runAuthorizedTool(
        gitTool(execute),
        { operation: 'push', args: ['origin', 'agent/topic'] },
        contextWith({ principalId: 'p1', grantId: 'g1', requireAuthorized }),
      ),
    ).rejects.toThrow('DIRECT_PUSH_DISABLED')
    expect(execute).not.toHaveBeenCalled()
  })

  it('fails closed for a tool with no registered permission descriptor', async () => {
    const requireAuthorized = vi.fn(async () => undefined)
    const execute = vi.fn(async () => 'ok')
    const accessControl: ToolAccessControl = {
      principalId: 'p1',
      grantId: 'g1',
      requireAuthorized,
    }
    const unknownTool: RuntimeToolDefinition = {
      name: 'not_a_real_tool' as RuntimeToolDefinition['name'],
      description: 'unregistered',
      capability: 'APPROVED_COMMAND',
      execute,
    }

    await expect(runAuthorizedTool(unknownTool, {}, contextWith(accessControl))).rejects.toThrow(
      'UNKNOWN_TOOL',
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('passes undefined metadata when the tool input is not a plain object', async () => {
    const requireAuthorized = vi.fn(async () => undefined)
    const execute = vi.fn(async () => 'ok')
    const accessControl: ToolAccessControl = {
      principalId: 'p1',
      grantId: 'g1',
      requireAuthorized,
    }
    const grepTool: RuntimeToolDefinition = {
      name: 'grep',
      description: 'test grep tool',
      capability: 'SEARCH',
      execute,
    }

    await runAuthorizedTool(grepTool, ['not', 'an', 'object'], contextWith(accessControl))
    expect(requireAuthorized).toHaveBeenCalledWith(
      'symbolwright.repository.search',
      'grep',
      undefined,
    )
  })
})

describe('runAuthorizedTool: sandbox_egress_request', () => {
  const originalPolicyFileEnv = process.env[SANDBOX_NETWORK_POLICY_FILE_ENV]
  let workspaceRoot: string

  afterEach(() => {
    clearApplicationSandboxNetworkRuntimesForTests()
    if (workspaceRoot !== undefined) rmSync(workspaceRoot, { recursive: true, force: true })
    if (originalPolicyFileEnv === undefined) {
      delete process.env[SANDBOX_NETWORK_POLICY_FILE_ENV]
    } else {
      process.env[SANDBOX_NETWORK_POLICY_FILE_ENV] = originalPolicyFileEnv
    }
  })

  function egressTool(execute: RuntimeToolDefinition['execute']): RuntimeToolDefinition {
    return {
      name: 'sandbox_egress_request',
      description: 'test egress tool',
      capability: 'WEB_ACCESS',
      execute,
    }
  }

  function configureOperatorEgressPolicy(): void {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-authorized-egress-'))
    const policyFile = path.join(workspaceRoot, 'sandbox-network-policy.json')
    writeFileSync(
      policyFile,
      JSON.stringify({
        schemaVersion: 1,
        egressProfiles: [
          {
            id: 'docs-only',
            version: 1,
            enabled: true,
            deploymentModes: ['local'],
            callerKinds: ['operator'],
            allowedHosts: ['docs.example.com'],
            allowedMethods: ['GET', 'HEAD'],
            allowedRequestHeaders: ['accept'],
            allowedPorts: [443],
            redirectPolicy: 'same-host',
            credentialPolicy: 'none',
            requireTls: true,
            auditRetentionDays: 30,
            limits: DEFAULT_EGRESS_POLICY_LIMITS,
          },
        ],
        defaultEgressPolicy: { id: 'docs-only', version: 1 },
      }),
      { mode: 0o600 },
    )
    process.env[SANDBOX_NETWORK_POLICY_FILE_ENV] = policyFile
  }

  it('builds an operator-approved egress authorization from the default policy when no accessControl is present', async () => {
    configureOperatorEgressPolicy()
    const execute = vi.fn(async (_input, ctx: RuntimeToolContext) => {
      expect(ctx.sandboxEgressAuthorization).toMatchObject({
        callerKind: 'operator',
        approvedCapabilityIds: ['symbolwright.sandbox.egress'],
        policyReference: { id: 'docs-only', version: 1 },
      })
      return 'ok'
    })

    const result = await runAuthorizedTool(
      egressTool(execute),
      { url: 'https://docs.example.com/guide' },
      { cwd: workspaceRoot, policy: createRuntimePolicyForMode('APPROVED_EXECUTION') },
    )

    expect(result).toBe('ok')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('does not build egress authorization when no operator default policy is configured', async () => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-authorized-egress-none-'))
    const execute = vi.fn(async (_input, ctx: RuntimeToolContext) => {
      expect(ctx.sandboxEgressAuthorization).toBeUndefined()
      return 'ok'
    })

    await runAuthorizedTool(
      egressTool(execute),
      { url: 'https://docs.example.com/guide' },
      { cwd: workspaceRoot, policy: createRuntimePolicyForMode('APPROVED_EXECUTION') },
    )

    expect(execute).toHaveBeenCalledOnce()
  })

  it('requires the egress capability for a delegated caller and refuses execution when denied', async () => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-authorized-egress-delegated-'))
    const requireAuthorized = vi.fn(async (capability: string) => {
      if (capability === 'symbolwright.sandbox.egress') {
        throw new Error('authorization_denied[EGRESS_NOT_APPROVED]: nope')
      }
    })
    const execute = vi.fn(async () => 'ok')
    const accessControl: ToolAccessControl = { principalId: 'p1', grantId: 'g1', requireAuthorized }

    await expect(
      runAuthorizedTool(
        egressTool(execute),
        { url: 'https://docs.example.com/guide' },
        {
          cwd: workspaceRoot,
          policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
          accessControl,
        },
      ),
    ).rejects.toThrow('EGRESS_NOT_APPROVED')
    expect(execute).not.toHaveBeenCalled()
    expect(requireAuthorized).toHaveBeenCalledWith(
      'symbolwright.sandbox.egress',
      'sandbox_egress_request',
      { url: 'https://docs.example.com/guide' },
    )
  })
})
