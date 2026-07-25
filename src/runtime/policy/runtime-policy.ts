import fs from 'node:fs'
import path from 'node:path'

import type { SymbolWrightRuntimeMode, RuntimePolicySnapshot } from '../types.js'

/** Paths blocked from read/write access by default policy. */
export const DEFAULT_RUNTIME_PROTECTED_PATHS = [
  '.git',
  '.symbolwright', // local mission/checkpoint state
  '.codemind', // legacy local mission/checkpoint state (pre-rebrand)
  '.env',
  '.env.local',
  'node_modules',
  'dist',
  'coverage',
] as const

/** Directories excluded from file-listing to reduce noise. */
export const DEFAULT_RUNTIME_NOISY_DIRS = [
  '.git',
  '.symbolwright', // local mission/checkpoint state
  '.codemind', // legacy local mission/checkpoint state (pre-rebrand)
  'node_modules',
  'dist',
  'coverage',
  '.next',
] as const

/** Existing runtime modes are the single source of truth for strictness. */
export const SYMBOLWRIGHT_RUNTIME_MODES = [
  'PLAN_ONLY',
  'READ_ONLY',
  'PROPOSAL_ONLY',
  'APPROVED_EXECUTION',
] as const satisfies readonly SymbolWrightRuntimeMode[]

export const DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE: SymbolWrightRuntimeMode = 'APPROVED_EXECUTION'

const RUNTIME_MODE_ALIASES: Readonly<Record<string, SymbolWrightRuntimeMode>> = {
  PLAN: 'PLAN_ONLY',
  PLAN_ONLY: 'PLAN_ONLY',
  READ: 'READ_ONLY',
  READ_ONLY: 'READ_ONLY',
  PROPOSAL: 'PROPOSAL_ONLY',
  PATCH_PROPOSAL: 'PROPOSAL_ONLY',
  PROPOSAL_ONLY: 'PROPOSAL_ONLY',
  APPROVED: 'APPROVED_EXECUTION',
  APPROVED_EDIT: 'APPROVED_EXECUTION',
  APPROVED_COMMAND: 'APPROVED_EXECUTION',
  APPROVED_EXECUTION: 'APPROVED_EXECUTION',
  DIRECT: 'APPROVED_EXECUTION',
  UNRESTRICTED: 'APPROVED_EXECUTION',
  OFF: 'APPROVED_EXECUTION',
}

export interface RuntimePolicyOptions {
  readonly hasGitHubToken?: boolean
}

/** Normalizes CLI/env/config aliases onto the existing runtime-mode union. */
export function normalizeSymbolWrightRuntimeMode(
  value: unknown,
): SymbolWrightRuntimeMode | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized.length === 0) {
    return undefined
  }

  return RUNTIME_MODE_ALIASES[normalized]
}

/** Returns true when value is one of the canonical runtime modes. */
export function isSymbolWrightRuntimeMode(value: string): value is SymbolWrightRuntimeMode {
  return (SYMBOLWRIGHT_RUNTIME_MODES as readonly string[]).includes(value)
}

/** Creates a policy for the selected runtime mode without inventing another mode system. */
export function createRuntimePolicyForMode(
  mode: SymbolWrightRuntimeMode,
  options: RuntimePolicyOptions = {},
): RuntimePolicySnapshot {
  const base = {
    protectedPaths: DEFAULT_RUNTIME_PROTECTED_PATHS,
    noisyDirs: DEFAULT_RUNTIME_NOISY_DIRS,
  } as const

  switch (mode) {
    case 'PLAN_ONLY':
      return {
        mode,
        allowNetwork: false,
        allowReadOnlyNetwork: true,
        allowShell: false,
        allowWrites: false,
        allowGitHubWrites: false,
        ...base,
      }
    case 'READ_ONLY':
      return {
        mode,
        allowNetwork: false,
        allowReadOnlyNetwork: true,
        allowShell: false,
        allowWrites: false,
        allowGitHubWrites: false,
        ...base,
      }
    case 'PROPOSAL_ONLY':
      return {
        mode,
        allowNetwork: false,
        allowReadOnlyNetwork: true,
        allowShell: false,
        allowWrites: false,
        allowGitHubWrites: false,
        ...base,
      }
    case 'APPROVED_EXECUTION':
      return {
        mode,
        allowNetwork: true,
        allowReadOnlyNetwork: true,
        allowShell: true,
        allowWrites: true,
        allowGitHubWrites: options.hasGitHubToken ?? true,
        ...base,
      }
  }
}

/** Creates an execution-ready policy with real local tools active by default. */
export function createDefaultRuntimePolicy(): RuntimePolicySnapshot {
  return createRuntimePolicyForMode(DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE, { hasGitHubToken: true })
}

/** Resolves a user path against the workspace root, blocking traversal. */
export function resolveWorkspacePath(workspaceRoot: string, userPath: string): string {
  const root = path.resolve(workspaceRoot)
  const resolvedPath = path.resolve(root, userPath)

  if (!isPathInsideWorkspace(root, resolvedPath)) {
    throw new Error(`Access blocked outside workspace: ${userPath}`)
  }

  return resolvedPath
}

function isLexicallyInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Resolves `candidate` to its real, symlink-followed location. Walks up to
 * the nearest ancestor that actually exists on disk (so a write target that
 * doesn't exist yet is validated via its real parent directory), then
 * appends any trailing segments that don't exist yet -- those can't be
 * symlinks, so they don't need real-path resolution. Falls back to the
 * lexical path if no ancestor can be resolved at all (e.g. a permissions
 * error walking up to the filesystem root), which only ever narrows back to
 * the pre-existing lexical-only check, never widens it.
 */
function realContainingPath(candidate: string): string {
  const trailingSegments: string[] = []
  let current = candidate

  for (;;) {
    try {
      const real = fs.realpathSync(current)
      return trailingSegments.length === 0 ? real : path.join(real, ...trailingSegments.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) {
        return candidate
      }
      trailingSegments.push(path.basename(current))
      current = parent
    }
  }
}

/**
 * Returns true if the resolved path is within the workspace root, checking
 * both the lexical path and the real (symlink-resolved) location. A symlink
 * whose textual path sits inside the workspace but whose target resolves
 * outside it fails this check even though it passes the lexical one.
 */
export function isPathInsideWorkspace(workspaceRoot: string, resolvedPath: string): boolean {
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(resolvedPath)

  if (!isLexicallyInside(root, candidate)) {
    return false
  }

  return isLexicallyInside(realContainingPath(root), realContainingPath(candidate))
}

/** Throws if the path is outside the workspace or hits a protected path. */
export function assertReadablePath(
  policy: RuntimePolicySnapshot,
  workspaceRoot: string,
  resolvedPath: string,
): void {
  if (!isPathInsideWorkspace(workspaceRoot, resolvedPath)) {
    throw new Error(`Access blocked outside workspace: ${resolvedPath}`)
  }

  const relative = path.relative(path.resolve(workspaceRoot), path.resolve(resolvedPath))
  const segments = relative.split(path.sep).filter(Boolean)
  const basename = path.basename(resolvedPath)

  for (const protectedPath of policy.protectedPaths) {
    if (segments.includes(protectedPath) || basename === protectedPath) {
      throw new Error(`Access blocked by policy for protected path: ${protectedPath}`)
    }
  }
}

/** Throws only when local writes are disabled by policy. Approval tickets are not required. */
export function assertWriteApproved(policy: RuntimePolicySnapshot, _approval?: unknown): void {
  if (!policy.allowWrites) {
    throw new Error('Write actions are disabled by runtime policy.')
  }
}

/** Throws if shell execution is disabled by the active policy. */
export function assertShellAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowShell) {
    throw new Error('Shell execution is disabled by runtime policy.')
  }
}

/** Throws only when shell execution is disabled by policy. Approval tickets are not required. */
export function assertShellApproved(policy: RuntimePolicySnapshot, _approval?: unknown): void {
  if (!policy.allowShell) {
    throw new Error('Shell execution is disabled by runtime policy.')
  }
}

/** Throws only when git write operations are disabled by policy. Approval tickets are not required. */
export function assertGitWriteApproved(policy: RuntimePolicySnapshot, _approval?: unknown): void {
  if (!policy.allowWrites) {
    throw new Error('Write actions are disabled by runtime policy.')
  }
}

/** Throws only when GitHub writes are disabled by policy. */
export function assertGitHubWriteApproved(
  policy: RuntimePolicySnapshot,
  _approval?: unknown,
): void {
  if (!policy.allowGitHubWrites) {
    throw new Error('GitHub writes are disabled by runtime policy.')
  }
}

/** Throws if network ingestion is disabled by the active policy. */
export function assertNetworkAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowNetwork) {
    throw new Error('Network ingestion is disabled by runtime policy.')
  }
}

/**
 * Throws if read-only info access (docs/package lookups, web fetch/search,
 * repo context) is disabled. True in every built-in mode — this only trips
 * for a hand-built policy that explicitly opts out.
 */
export function assertReadOnlyNetworkAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowReadOnlyNetwork) {
    throw new Error('Read-only network access is disabled by runtime policy.')
  }
}

/** Validates that a policy object has correct shape and field types. */
export function assertValidPolicy(policy: unknown): asserts policy is RuntimePolicySnapshot {
  if (typeof policy !== 'object' || policy === null) {
    throw new Error('RuntimePolicySnapshot must be a non-null object')
  }
  const p = policy as Record<string, unknown>

  if (typeof p['mode'] !== 'string' || !isSymbolWrightRuntimeMode(p['mode'])) {
    throw new Error(`Invalid policy mode: ${String(p['mode'])}`)
  }

  for (const field of [
    'allowNetwork',
    'allowReadOnlyNetwork',
    'allowShell',
    'allowWrites',
    'allowGitHubWrites',
  ] as const) {
    if (typeof p[field] !== 'boolean') {
      throw new Error(`Policy field "${field}" must be a boolean, got ${typeof p[field]}`)
    }
  }

  if (!Array.isArray(p['protectedPaths'])) {
    throw new Error('Policy field "protectedPaths" must be an array')
  }

  for (const entry of p['protectedPaths'] as unknown[]) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new Error('Each protectedPaths entry must be a non-empty string')
    }
  }

  if (!Array.isArray(p['noisyDirs'])) {
    throw new Error('Policy field "noisyDirs" must be an array')
  }

  for (const entry of p['noisyDirs'] as unknown[]) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new Error('Each noisyDirs entry must be a non-empty string')
    }
  }
}
