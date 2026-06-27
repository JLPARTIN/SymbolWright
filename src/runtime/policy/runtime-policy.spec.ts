import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  assertGitWriteApproved,
  assertNetworkAllowed,
  assertReadablePath,
  assertShellAllowed,
  assertShellApproved,
  assertValidPolicy,
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
        scopes: ['apply_edit'],
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

describe('assertShellApproved', () => {
  const approvedPolicy: RuntimePolicySnapshot = {
    ...createDefaultRuntimePolicy(),
    mode: 'APPROVED_EXECUTION',
    allowShell: true,
    allowWrites: true,
  }

  it('blocks when policy disables shell', () => {
    const policy = createDefaultRuntimePolicy()
    const approval: RuntimeApproval = {
      ticketId: 'T-1',
      approvedBy: 'operator',
      scopes: ['shell:execute'],
    }
    expect(() => assertShellApproved(policy, approval)).toThrow(
      'Shell execution is disabled by runtime policy.',
    )
  })

  it('blocks when approval is undefined', () => {
    expect(() => assertShellApproved(approvedPolicy, undefined)).toThrow(
      'Shell execution requires explicit approval.',
    )
  })

  it('blocks when approval lacks shell:execute and command:validate scopes', () => {
    const approval: RuntimeApproval = {
      ticketId: 'T-2',
      approvedBy: 'operator',
      scopes: ['file:write'],
    }
    expect(() => assertShellApproved(approvedPolicy, approval)).toThrow(
      'Approval does not include shell:execute or command:validate scope.',
    )
  })

  it('allows with shell:execute scope', () => {
    const approval: RuntimeApproval = {
      ticketId: 'T-3',
      approvedBy: 'operator',
      scopes: ['shell:execute'],
    }
    expect(() => assertShellApproved(approvedPolicy, approval)).not.toThrow()
  })

  it('allows with command:validate scope as fallback', () => {
    const approval: RuntimeApproval = {
      ticketId: 'T-4',
      approvedBy: 'operator',
      scopes: ['command:validate'],
    }
    expect(() => assertShellApproved(approvedPolicy, approval)).not.toThrow()
  })
})

describe('assertGitWriteApproved', () => {
  const approvedPolicy: RuntimePolicySnapshot = {
    ...createDefaultRuntimePolicy(),
    mode: 'APPROVED_EXECUTION',
    allowShell: true,
    allowWrites: true,
  }

  it('blocks when policy disables writes', () => {
    const policy = createDefaultRuntimePolicy()
    const approval: RuntimeApproval = {
      ticketId: 'T-1',
      approvedBy: 'operator',
      scopes: ['git:write'],
    }
    expect(() => assertGitWriteApproved(policy, approval)).toThrow(
      'Write actions are disabled by runtime policy.',
    )
  })

  it('blocks when approval is undefined', () => {
    expect(() => assertGitWriteApproved(approvedPolicy, undefined)).toThrow(
      'Git write operations require explicit approval.',
    )
  })

  it('blocks when approval lacks git:write and apply_edit scopes', () => {
    const approval: RuntimeApproval = {
      ticketId: 'T-2',
      approvedBy: 'operator',
      scopes: ['file:write'],
    }
    expect(() => assertGitWriteApproved(approvedPolicy, approval)).toThrow(
      'Approval does not include git:write scope.',
    )
  })

  it('allows with git:write scope', () => {
    const approval: RuntimeApproval = {
      ticketId: 'T-3',
      approvedBy: 'operator',
      scopes: ['git:write'],
    }
    expect(() => assertGitWriteApproved(approvedPolicy, approval)).not.toThrow()
  })

  it('allows with apply_edit scope as fallback', () => {
    const approval: RuntimeApproval = {
      ticketId: 'T-4',
      approvedBy: 'operator',
      scopes: ['apply_edit'],
    }
    expect(() => assertGitWriteApproved(approvedPolicy, approval)).not.toThrow()
  })
})

describe('assertValidPolicy', () => {
  it('accepts a valid policy from createDefaultRuntimePolicy', () => {
    expect(() => assertValidPolicy(createDefaultRuntimePolicy())).not.toThrow()
  })

  it('accepts a valid APPROVED_EXECUTION policy', () => {
    const policy = {
      ...createDefaultRuntimePolicy(),
      mode: 'APPROVED_EXECUTION',
      allowWrites: true,
      allowShell: true,
    }
    expect(() => assertValidPolicy(policy)).not.toThrow()
  })

  it('rejects null', () => {
    expect(() => assertValidPolicy(null)).toThrow('non-null object')
  })

  it('rejects undefined', () => {
    expect(() => assertValidPolicy(undefined)).toThrow('non-null object')
  })

  it('rejects missing mode', () => {
    const { mode: _, ...noMode } = createDefaultRuntimePolicy()
    expect(() => assertValidPolicy(noMode)).toThrow('Invalid policy mode')
  })

  it('rejects invalid mode string', () => {
    const policy = { ...createDefaultRuntimePolicy(), mode: 'INVALID_MODE' }
    expect(() => assertValidPolicy(policy)).toThrow('Invalid policy mode')
  })

  it('rejects undefined allowWrites', () => {
    const policy = { ...createDefaultRuntimePolicy(), allowWrites: undefined }
    expect(() => assertValidPolicy(policy)).toThrow('"allowWrites" must be a boolean')
  })

  it('rejects non-boolean allowShell', () => {
    const policy = { ...createDefaultRuntimePolicy(), allowShell: 'yes' }
    expect(() => assertValidPolicy(policy)).toThrow('"allowShell" must be a boolean')
  })

  it('rejects non-array protectedPaths', () => {
    const policy = { ...createDefaultRuntimePolicy(), protectedPaths: 'not-an-array' }
    expect(() => assertValidPolicy(policy)).toThrow('"protectedPaths" must be an array')
  })

  it('rejects non-array noisyDirs', () => {
    const policy = { ...createDefaultRuntimePolicy(), noisyDirs: null }
    expect(() => assertValidPolicy(policy)).toThrow('"noisyDirs" must be an array')
  })
})
