import { describe, expect, it, vi } from 'vitest'

import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
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
