import { describe, expect, it, vi } from 'vitest'

import { runAuthorizedTool } from './authorized-tool-execution.js'
import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import type { RuntimeToolContext, RuntimeToolDefinition, ToolAccessControl } from '../types.js'

function bashTool(execute: RuntimeToolDefinition['execute']): RuntimeToolDefinition {
  return {
    name: 'bash',
    description: 'test bash tool',
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
    expect(requireAuthorized).toHaveBeenCalledWith('symbolwright.sandbox.execute', 'bash', {
      command: 'git status',
    })
    expect(execute).toHaveBeenCalledOnce()
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
