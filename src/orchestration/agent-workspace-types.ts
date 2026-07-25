export const AGENT_WORKSPACE_MODES = [
  'read-only',
  'patch-proposal',
  'worktree',
  'container',
] as const
export type AgentWorkspaceMode = (typeof AGENT_WORKSPACE_MODES)[number]

export const AGENT_WORKSPACE_STATUSES = [
  'creating',
  'ready',
  'leased',
  'submitted',
  'integrated',
  'discarded',
  'cleanup-failed',
] as const
export type AgentWorkspaceStatus = (typeof AGENT_WORKSPACE_STATUSES)[number]

/**
 * An isolated environment for one agent's one mutating task. Worktree isolation is *not* treated
 * as a security boundary on its own (Section 12 of the mission brief) — every write inside it
 * still passes through the same `resolveWorkspacePath`/`isPathInsideWorkspace` containment and
 * protected-path policy the rest of the runtime uses, scoped further to `allowedWritePaths`.
 */
export interface AgentWorkspace {
  readonly id: string
  readonly teamId: string
  readonly taskId: string
  readonly agentId: string
  readonly repositoryRoot: string
  readonly baseSha: string
  readonly branchName?: string
  readonly rootPath: string
  readonly mode: AgentWorkspaceMode
  readonly allowedReadPaths: readonly string[]
  readonly allowedWritePaths: readonly string[]
  status: AgentWorkspaceStatus
  readonly createdAt: string
  readonly leaseExpiresAt: string
  discardedAt?: string
  discardReason?: string
}
