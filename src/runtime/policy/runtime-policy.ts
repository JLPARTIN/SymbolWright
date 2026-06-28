import path from 'node:path'

import type { CodemindRuntimeMode, RuntimePolicySnapshot } from '../types.js'

/** Paths blocked from read/write access by default policy. */
export const DEFAULT_RUNTIME_PROTECTED_PATHS = [
  '.git',
  '.env',
  '.env.local',
  'node_modules',
  'dist',
  'coverage',
] as const

/** Directories excluded from file-listing to reduce noise. */
export const DEFAULT_RUNTIME_NOISY_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
] as const

/** Creates an execution-ready policy with real local tools active by default. */
export function createDefaultRuntimePolicy(): RuntimePolicySnapshot {
  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: true,
    allowShell: true,
    allowWrites: true,
    allowGitHubWrites: true,
    protectedPaths: DEFAULT_RUNTIME_PROTECTED_PATHS,
    noisyDirs: DEFAULT_RUNTIME_NOISY_DIRS,
  }
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

/** Returns true if the resolved path is within the workspace root. */
export function isPathInsideWorkspace(workspaceRoot: string, resolvedPath: string): boolean {
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(resolvedPath)
  const relative = path.relative(root, candidate)

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
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
export function assertWriteApproved(
  policy: RuntimePolicySnapshot,
  _approval?: unknown,
): void {
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
export function assertShellApproved(
  policy: RuntimePolicySnapshot,
  _approval?: unknown,
): void {
  if (!policy.allowShell) {
    throw new Error('Shell execution is disabled by runtime policy.')
  }
}

/** Throws only when git write operations are disabled by policy. Approval tickets are not required. */
export function assertGitWriteApproved(
  policy: RuntimePolicySnapshot,
  _approval?: unknown,
): void {
  if (!policy.allowWrites) {
    throw new Error('Write actions are disabled by runtime policy.')
  }
}

/** Throws only when GitHub writes are disabled by policy. Approval tickets are not required. */
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

const VALID_MODES: readonly CodemindRuntimeMode[] = [
  'PLAN_ONLY',
  'READ_ONLY',
  'PROPOSAL_ONLY',
  'APPROVED_EXECUTION',
]

/** Validates that a policy object has correct shape and field types. */
export function assertValidPolicy(policy: unknown): asserts policy is RuntimePolicySnapshot {
  if (typeof policy !== 'object' || policy === null) {
    throw new Error('RuntimePolicySnapshot must be a non-null object')
  }
  const p = policy as Record<string, unknown>

  if (!(VALID_MODES as readonly string[]).includes(p['mode'] as string)) {
    throw new Error(`Invalid policy mode: ${String(p['mode'])}`)
  }

  for (const field of ['allowNetwork', 'allowShell', 'allowWrites', 'allowGitHubWrites'] as const) {
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
