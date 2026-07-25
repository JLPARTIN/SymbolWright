import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RuntimePolicySnapshot } from '../types.js'
import {
  assertGitHubWriteApproved,
  assertGitWriteApproved,
  assertNetworkAllowed,
  assertReadOnlyNetworkAllowed,
  assertReadablePath,
  assertShellAllowed,
  assertShellApproved,
  assertValidPolicy,
  assertWriteApproved,
  createDefaultRuntimePolicy,
  createRuntimePolicyForMode,
  isSymbolWrightRuntimeMode,
  isPathInsideWorkspace,
  normalizeSymbolWrightRuntimeMode,
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

  it('allows read-only network access (docs/package lookups) in every runtime mode', () => {
    for (const mode of ['PLAN_ONLY', 'READ_ONLY', 'PROPOSAL_ONLY', 'APPROVED_EXECUTION'] as const) {
      expect(createRuntimePolicyForMode(mode).allowReadOnlyNetwork).toBe(true)
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
    expect(normalizeSymbolWrightRuntimeMode('direct')).toBe('APPROVED_EXECUTION')
    expect(normalizeSymbolWrightRuntimeMode('off')).toBe('APPROVED_EXECUTION')
    expect(normalizeSymbolWrightRuntimeMode('approved')).toBe('APPROVED_EXECUTION')
    expect(normalizeSymbolWrightRuntimeMode('read-only')).toBe('READ_ONLY')
    expect(normalizeSymbolWrightRuntimeMode('proposal only')).toBe('PROPOSAL_ONLY')
    expect(normalizeSymbolWrightRuntimeMode('invalid')).toBeUndefined()
  })

  it('recognizes canonical runtime modes', () => {
    expect(isSymbolWrightRuntimeMode('PLAN_ONLY')).toBe(true)
    expect(isSymbolWrightRuntimeMode('READ_ONLY')).toBe(true)
    expect(isSymbolWrightRuntimeMode('PROPOSAL_ONLY')).toBe(true)
    expect(isSymbolWrightRuntimeMode('APPROVED_EXECUTION')).toBe(true)
    expect(isSymbolWrightRuntimeMode('DIRECT')).toBe(false)
  })

  it('resolves paths inside the workspace', () => {
    const workspace = path.resolve('/workspace/symbolwright')
    const resolved = resolveWorkspacePath(workspace, 'src/index.ts')

    expect(resolved).toBe(path.join(workspace, 'src/index.ts'))
    expect(isPathInsideWorkspace(workspace, resolved)).toBe(true)
  })

  it('blocks path traversal outside the workspace', () => {
    const workspace = path.resolve('/workspace/symbolwright')

    expect(() => resolveWorkspacePath(workspace, '../outside.txt')).toThrow(
      'Access blocked outside workspace',
    )
  })

  it('blocks readable protected paths', () => {
    const workspace = path.resolve('/workspace/symbolwright')
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

describe('assertReadOnlyNetworkAllowed', () => {
  it('allows read-only network access by default', () => {
    const policy = createDefaultRuntimePolicy()
    expect(() => assertReadOnlyNetworkAllowed(policy)).not.toThrow()
  })

  it('allows read-only network access even in strict, non-mutating modes', () => {
    for (const mode of ['PLAN_ONLY', 'READ_ONLY', 'PROPOSAL_ONLY'] as const) {
      expect(() => assertReadOnlyNetworkAllowed(createRuntimePolicyForMode(mode))).not.toThrow()
    }
  })

  it('blocks only when a policy explicitly disables it', () => {
    const policy: RuntimePolicySnapshot = {
      ...createDefaultRuntimePolicy(),
      allowReadOnlyNetwork: false,
    }

    expect(() => assertReadOnlyNetworkAllowed(policy)).toThrow(
      'Read-only network access is disabled by runtime policy.',
    )
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

  it('rejects undefined allowReadOnlyNetwork', () => {
    const policy = { ...createDefaultRuntimePolicy(), allowReadOnlyNetwork: undefined }
    expect(() => assertValidPolicy(policy)).toThrow('"allowReadOnlyNetwork" must be a boolean')
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

describe('symlink-aware workspace containment', () => {
  let outsideDir: string
  let workspace: string

  beforeEach(() => {
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-outside-'))
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-workspace-'))
  })

  afterEach(() => {
    fs.rmSync(outsideDir, { recursive: true, force: true })
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  it('rejects a symlink inside the workspace whose target resolves outside it', () => {
    const secretOutside = path.join(outsideDir, 'secret.txt')
    fs.writeFileSync(secretOutside, 'top secret', 'utf8')
    const evilLink = path.join(workspace, 'evil-link.txt')
    fs.symlinkSync(secretOutside, evilLink)

    expect(isPathInsideWorkspace(workspace, evilLink)).toBe(false)
    expect(() => resolveWorkspacePath(workspace, 'evil-link.txt')).toThrow(
      'Access blocked outside workspace',
    )
  })

  it('rejects a symlinked directory inside the workspace whose target resolves outside it', () => {
    const linkedDir = path.join(workspace, 'linked-dir')
    fs.symlinkSync(outsideDir, linkedDir)
    const newFileInsideLink = path.join(workspace, 'linked-dir', 'new-file.txt')

    expect(isPathInsideWorkspace(workspace, newFileInsideLink)).toBe(false)
    expect(() => resolveWorkspacePath(workspace, 'linked-dir/new-file.txt')).toThrow(
      'Access blocked outside workspace',
    )
  })

  it('still allows a real file inside the workspace with no symlinks involved', () => {
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true })
    const realFile = path.join(workspace, 'src', 'index.ts')
    fs.writeFileSync(realFile, 'export {}', 'utf8')

    expect(isPathInsideWorkspace(workspace, realFile)).toBe(true)
  })

  it('still allows a new file whose parent directory is real and exists', () => {
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true })
    const newFile = path.join(workspace, 'src', 'not-yet-created.ts')

    expect(isPathInsideWorkspace(workspace, newFile)).toBe(true)
  })

  it('still allows a new file nested under directories that do not exist yet', () => {
    const newNestedFile = path.join(workspace, 'a', 'b', 'c', 'new-file.ts')

    expect(isPathInsideWorkspace(workspace, newNestedFile)).toBe(true)
  })

  it('still allows a symlink whose target resolves inside the workspace', () => {
    fs.mkdirSync(path.join(workspace, 'real-target'), { recursive: true })
    const realTarget = path.join(workspace, 'real-target', 'file.txt')
    fs.writeFileSync(realTarget, 'content', 'utf8')
    const linkInsideWorkspace = path.join(workspace, 'link-to-real.txt')
    fs.symlinkSync(realTarget, linkInsideWorkspace)

    expect(isPathInsideWorkspace(workspace, linkInsideWorkspace)).toBe(true)
  })
})
