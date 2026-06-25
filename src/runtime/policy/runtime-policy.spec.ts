import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimePolicySnapshot } from '../types.js'
import {
  assertNetworkAllowed,
  assertReadablePath,
  assertShellAllowed,
  assertWriteApproved,
  createDefaultRuntimePolicy,
  isPathInsideWorkspace,
  resolveWorkspacePath,
} from './runtime-policy.js'

describe('runtime policy', () => {
  it('starts read-only with network, shell, and writes disabled', () => {
    const policy = createDefaultRuntimePolicy()

    expect(policy.mode).toBe('READ_ONLY')
    expect(policy.allowNetwork).toBe(false)
    expect(policy.allowShell).toBe(false)
    expect(policy.allowWrites).toBe(false)
  })

  it('resolves paths inside the workspace', () => {
    const workspace = path.resolve('/workspace/codemind')
    const resolved = resolveWorkspacePath(workspace, 'src/index.ts')

    expect(resolved).toBe(path.join(workspace, 'src/index.ts'))
    expect(isPathInsideWorkspace(workspace, resolved)).toBe(true)
  })

  it('blocks path traversal outside the workspace', () => {
    const workspace = path.resolve('/workspace/codemind')

    expect(() => resolveWorkspacePath(workspace, '../outside.txt')).toThrow(
      'Access blocked outside workspace',
    )
  })

  it('blocks readable protected paths', () => {
    const workspace = path.resolve('/workspace/codemind')
    const policy = createDefaultRuntimePolicy()
    const resolved = path.join(workspace, '.git', 'config')

    expect(() => assertReadablePath(policy, workspace, resolved)).toThrow(
      'Access blocked by policy for protected path: .git',
    )
  })

  it('keeps writes disabled even when approval-shaped data is supplied', () => {
    const policy = createDefaultRuntimePolicy()

    expect(() =>
      assertWriteApproved(policy, {
        ticketId: 'approval-1',
        approvedBy: 'operator',
        scopes: ['runtime:test'],
      }),
    ).toThrow('Write actions are disabled by runtime policy.')
  })

  it('requires approval when a later policy explicitly enables writes', () => {
    const policy: RuntimePolicySnapshot = {
      ...createDefaultRuntimePolicy(),
      mode: 'APPROVED_EXECUTION',
      allowWrites: true,
    }

    expect(() => assertWriteApproved(policy, undefined)).toThrow(
      'Write actions require explicit approval.',
    )
  })

  it('keeps shell execution and network ingestion disabled by default', () => {
    const policy = createDefaultRuntimePolicy()

    expect(() => assertShellAllowed(policy)).toThrow(
      'Shell execution is disabled by runtime policy.',
    )
    expect(() => assertNetworkAllowed(policy)).toThrow(
      'Network ingestion is disabled by runtime policy.',
    )
  })
})
