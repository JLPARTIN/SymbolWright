import path from 'node:path'

import type { CodemindRuntimeMode, RuntimeApproval, RuntimePolicySnapshot } from '../types.js'

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

/** Creates a read-only policy with all write flags disabled. */
export function createDefaultRuntimePolicy(): RuntimePolicySnapshot {
  return {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
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

/** Throws if writes are disabled or approval is missing. */
export function assertWriteApproved(
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): void {
  if (!policy.allowWrites) {
    throw new Error('Write actions are disabled by runtime policy.')
  }

  if (approval === undefined) {
    throw new Error('Write actions require explicit approval.')
  }
}

/** Throws if shell execution is disabled by the active policy. */
export function assertShellAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowShell) {
    throw new Error('Shell execution is disabled by runtime policy.')
  }
}

/** Throws if shell execution is disabled or approval is missing the shell:execute scope. */
export function assertShellApproved(
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): void {
  if (!policy.allowShell) {
    throw new Error('Shell execution is disabled by runtime policy.')
  }

  if (approval === undefined) {
    throw new Error('Shell execution requires explicit approval.')
  }

  if (!approval.scopes.includes('shell:execute') && !approval.scopes.includes('command:validate')) {
    throw new Error('Approval does not include shell:execute or command:validate scope.')
  }
}

/** Throws if git write operations are disabled or approval is missing the git:write scope. */
export function assertGitWriteApproved(
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): void {
  if (!policy.allowWrites) {
    throw new Error('Write actions are disabled by runtime policy.')
  }

  if (approval === undefined) {
    throw new Error('Git write operations require explicit approval.')
  }

  if (!approval.scopes.includes('git:write') && !approval.scopes.includes('apply_edit')) {
    throw new Error('Approval does not include git:write scope.')
  }
}

/** Throws if GitHub writes are disabled or approval is missing the github:write scope. */
export function assertGitHubWriteApproved(
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): void {
  if (!policy.allowGitHubWrites) {
    throw new Error('GitHub writes are disabled by runtime policy.')
  }

  if (approval === undefined) {
    throw new Error('GitHub writes require explicit approval.')
  }

  if (!approval.scopes.includes('github:write')) {
    throw new Error('Approval does not include github:write scope.')
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
