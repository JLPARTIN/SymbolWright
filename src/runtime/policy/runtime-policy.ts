import path from 'node:path'

import type { CodemindRuntimeMode, RuntimeApproval, RuntimePolicySnapshot } from '../types.js'

export const DEFAULT_RUNTIME_PROTECTED_PATHS = [
  '.git',
  '.env',
  '.env.local',
  'node_modules',
  'dist',
  'coverage',
] as const

export const DEFAULT_RUNTIME_NOISY_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
] as const

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

export function resolveWorkspacePath(workspaceRoot: string, userPath: string): string {
  const root = path.resolve(workspaceRoot)
  const resolvedPath = path.resolve(root, userPath)

  if (!isPathInsideWorkspace(root, resolvedPath)) {
    throw new Error(`Access blocked outside workspace: ${userPath}`)
  }

  return resolvedPath
}

export function isPathInsideWorkspace(workspaceRoot: string, resolvedPath: string): boolean {
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(resolvedPath)
  const relative = path.relative(root, candidate)

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

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

export function assertShellAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowShell) {
    throw new Error('Shell execution is disabled by runtime policy.')
  }
}

export function assertNetworkAllowed(policy: RuntimePolicySnapshot): void {
  if (!policy.allowNetwork) {
    throw new Error('Network ingestion is disabled by runtime policy.')
  }
}

const VALID_MODES: readonly CodemindRuntimeMode[] = [
  'PLAN_ONLY', 'READ_ONLY', 'PROPOSAL_ONLY', 'APPROVED_EXECUTION',
]

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

  if (!Array.isArray(p['noisyDirs'])) {
    throw new Error('Policy field "noisyDirs" must be an array')
  }
}
