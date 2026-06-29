import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimePolicySnapshot } from '../types.js'
import {
  assertGitHubWriteApproved,
  assertGitWriteApproved,
  assertNetworkAllowed,
  assertReadablePath,
  assertShellAllowed,
  assertShellApproved,
  assertValidPolicy,
  assertWriteApproved,
  createDefaultRuntimePolicy,
  createRuntimePolicyForMode,
  isCodemindRuntimeMode,
  isPathInsideWorkspace,
  normalizeCodemindRuntimeMode,
  resolveWorkspacePath,
} from './runtime-policy.js'

describe('runtime policy', () => {
  it('starts execution-ready with network, shell, local writes, and GitHub writes active', () => {
    const policy = createDefaultRuntimePolicy()

    expect(policy.mode).toBe('APPROVED_EXECUTION')
    expect(policy.allowNetwork).toBe(true)
    expect(policy.allowShell).toBe(true)
    expect(policy.allowWrites).toBe(true)
    expect(policy.allowGitHubWrites).toBe(true)
  })

  it('creates strict non-mutating policies from existing runtime modes', () => {
    for (const mode of ['PLAN_ONLY', 'READ_ONLY', 'PROPOSAL_ONLY'] as const) {
      const policy = createRuntimePolicyForMode(mode)
      expect(policy.mode).toBe(mode)
      expect(policy.allowNetwork).toBe(false)
      expect(policy.allowShell).toBe(false)
      expect(policy.allowWrites).toBe(false)
      expect(policy.allowGitHubWrites).toBe(false)
    }
  })

  it('creates direct execution policy from APPROVED_EXECUTION', () => {
    const policy = createRuntimePolicyForMode('APPROVED_EXECUTION', { hasGitHubToken: true })

    expect(policy.allowNetwork).toBe(true)
    expect(policy.allowShell).toBe(true)
    expect(policy.allowWrites).toBe(true)
    expect(policy.allowGitHubWrites).toBe(true)
  })

  it('keeps GitHub writes disabled in direct mode when no token is configured', () => {
    const policy = createRuntimePolicyForMode('APPROVED_EXECUTION', { hasGitHubToken: false })

    expect(policy.allowNetwork).toBe(true)
    expect(policy.allowShell).toBe(true)
    expect(policy.allowWrites).toBe(true)
    expect(policy.allowGitHubWrites).toBe(false)
  })

  it('normalizes runtime mode aliases onto the existing mode union', () => {
    expect(normalizeCodemindRuntimeMode('direct')).toBe('APPROVED_EXECUTION')
    expect(normalizeCodemindRuntimeMode('off')).toBe('APPROVED_EXECUTION')
    expect(normalizeCodemindRuntimeMode('approved')).toBe('APPROVED_EXECUTION')
    expect(normalizeCodemindRuntimeMode('read-only')).toBe('READ_ONLY')
    expect(normalizeCodemindRuntimeMode('proposal only')).toBe('PROPOSAL_ONLY')
    expect(normalizeCodemindRuntimeMode('invalid')).toBeUndefined()
  })

  it('recognizes canonical runtime modes', () => {
    expect(isCodemindRuntimeMode('PLAN_ONLY')).toBe(true)
    expect(isCodemindRuntimeMode('READ_ONLY')).toBe(true)
    expect(isCodemindRuntimeMode('PROPOSAL_ONLY')).toBe(true)
    expect(isCodemindRuntimeMode('APPROVED_EXECUTION')).toBe(true)
    expect(isCodemindRuntimeMode('DIRECT')).toBe(false)
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

  it('allows local writes without approval tickets when policy allows writes', () => {
    const policy = createDefaultRuntimePolicy()

    expect(() => assertWriteApproved(policy, undefined)).not.toThrow()
  })

  it('blocks local writes only when policy disables writes', () => {
    const policy: RuntimePolicySnapshot = {
      ...createDefaultRuntimePolicy(),
      allowWrites: false,
    }

    expect(() => assertWriteApproved(policy, undefined)).toThrow(
      'Write actions are disabled by runtime policy.',
    )
  })

  it('allows shell execution and network ingestion by default', () => {
    const policy = createDefaultRuntimePolicy()

    expect(() => assertShellAllowed(policy)).not.toThrow()
    expect(() => assertNetworkAllowed(policy)).not.toThrow()
  })
})

describe('assertShellApproved', () => {
  it('blocks when policy disables shell', () => {
    const policy: RuntimePolicySnapshot = {
      ...createDefaultRuntimePolicy(),
      allowShell: false,
    }

    expect(() => assertShellApproved(policy, undefined)).toThrow(
      'Shell execution is disabled by runtime policy.',
    )
  })

  it('does not require approval when shell is allowed', () => {
    expect(() => assertShellApproved(createDefaultRuntimePolicy(), undefined)).not.toThrow()
  })
})

describe('assertGitWriteApproved', () => {
  it('blocks when policy disables writes', () => {
    const policy: RuntimePolicySnapshot = {
      ...createDefaultRuntimePolicy(),
      allowWrites: false,
    }

    expect(() => assertGitWriteApproved(policy, undefined)).toThrow(
      'Write actions are disabled by runtime policy.',
    )
  })

  it('does not require approval when writes are allowed', () => {
    expect(() => assertGitWriteApproved(createDefaultRuntimePolicy(), undefined)).not.toThrow()
  })
})

describe('assertGitHubWriteApproved', () => {
  it('blocks when policy disables GitHub writes', () => {
    const policy: RuntimePolicySnapshot = {
      ...createDefaultRuntimePolicy(),
      allowGitHubWrites: false,
    }

    expect(() => assertGitHubWriteApproved(policy, undefined)).toThrow(
      'GitHub writes are disabled by runtime policy.',
    )
  })

  it('does not require approval when GitHub writes are allowed', () => {
    expect(() => assertGitHubWriteApproved(createDefaultRuntimePolicy(), undefined)).not.toThrow()
  })
})

describe('assertValidPolicy', () => {
  it('accepts a valid policy from createDefaultRuntimePolicy', () => {
    expect(() => assertValidPolicy(createDefaultRuntimePolicy())).not.toThrow()
  })

  it('accepts a valid READ_ONLY policy', () => {
    const policy = {
      ...createDefaultRuntimePolicy(),
      mode: 'READ_ONLY',
      allowWrites: false,
      allowShell: false,
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
