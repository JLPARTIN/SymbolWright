import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import path from 'node:path'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { isPathInsideWorkspace, resolveWorkspacePath } from '../runtime/policy/runtime-policy.js'
import type { OrchestrationStore } from './orchestration-store.js'
import type { AgentWorkspace, AgentWorkspaceMode } from './agent-workspace-types.js'
import type { OrchestrationAuditEvent } from './orchestration-types.js'

export class WorkspaceValidationError extends Error {}
export class WorkspaceScopeViolationError extends Error {}

export interface CreateWorkspaceInput {
  readonly teamId: string
  readonly taskId: string
  readonly agentId: string
  readonly repositoryRoot: string
  readonly mode: AgentWorkspaceMode
  readonly allowedReadPaths?: readonly string[]
  readonly allowedWritePaths?: readonly string[]
  readonly leaseMinutes?: number
}

const DEFAULT_LEASE_MINUTES = 60

/**
 * Isolated per-task, per-agent workspaces (Section 12). Parallel mutating tasks never share one
 * live working tree: `worktree` mode creates a real `git worktree` on an immutable base SHA, on
 * its own branch, so two agents editing the same repository concurrently physically cannot
 * collide on disk. This is *not* treated as a security boundary by itself — every write inside
 * the worktree still passes through `resolveWorkspacePath`/`isPathInsideWorkspace` (the same
 * symlink-aware containment the rest of the runtime uses) scoped further to `allowedWritePaths`.
 */
export class AgentWorkspaceService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async createWorkspace(input: CreateWorkspaceInput): Promise<AgentWorkspace> {
    const repositoryRoot = path.resolve(input.repositoryRoot)
    const headResult = await runGitCommand(['rev-parse', 'HEAD'], repositoryRoot)
    if (headResult.exitCode !== 0) {
      throw new WorkspaceValidationError(
        `Cannot resolve HEAD for "${repositoryRoot}": ${headResult.stderr.trim()}`,
      )
    }
    const baseSha = headResult.stdout.trim()
    const workspaceId = randomUUID()
    const nowIso = this.now().toISOString()
    const leaseExpiresAt = new Date(
      this.now().getTime() + (input.leaseMinutes ?? DEFAULT_LEASE_MINUTES) * 60_000,
    ).toISOString()

    let rootPath = repositoryRoot
    let branchName: string | undefined

    if (input.mode === 'worktree') {
      branchName = `symbolwright/agent-team/${input.teamId.slice(0, 8)}/${input.taskId.slice(0, 8)}-${workspaceId.slice(0, 8)}`
      rootPath = path.join(
        repositoryRoot,
        '.symbolwright',
        'orchestration',
        'workspaces',
        workspaceId,
      )
      const addResult = await runGitCommand(
        ['worktree', 'add', '-b', branchName, rootPath, baseSha],
        repositoryRoot,
      )
      if (addResult.exitCode !== 0) {
        throw new WorkspaceValidationError(
          `Failed to create isolated worktree: ${addResult.stderr.trim()}`,
        )
      }
    }

    const workspace: AgentWorkspace = {
      id: workspaceId,
      teamId: input.teamId,
      taskId: input.taskId,
      agentId: input.agentId,
      repositoryRoot,
      baseSha,
      rootPath,
      mode: input.mode,
      allowedReadPaths: [...(input.allowedReadPaths ?? [])],
      allowedWritePaths: [...(input.allowedWritePaths ?? [])],
      status: 'ready',
      createdAt: nowIso,
      leaseExpiresAt,
      ...(branchName === undefined ? {} : { branchName }),
    }
    this.store.workspaces.write(workspaceId, workspace)
    this.audit('workspace.created', workspace.teamId, input.agentId, {
      workspaceId,
      taskId: input.taskId,
      mode: input.mode,
    })
    return workspace
  }

  public getWorkspace(workspaceId: string): AgentWorkspace {
    const workspace = this.store.workspaces.read(workspaceId)
    if (workspace === undefined)
      throw new WorkspaceValidationError(`No such workspace: ${workspaceId}`)
    return workspace
  }

  /**
   * Verifies a relative write target is (a) contained within this workspace's own root
   * (symlink-aware) and (b) within the task's declared `allowedWritePaths`. Callers must still
   * run the write through the runtime's normal write path — this only proves the target is
   * in-scope for *this* isolated workspace and task.
   */
  public assertWritePathAllowed(workspace: AgentWorkspace, relativePath: string): string {
    if (workspace.mode === 'read-only') {
      throw new WorkspaceScopeViolationError(`Workspace "${workspace.id}" is read-only.`)
    }
    const resolved = resolveWorkspacePath(workspace.rootPath, relativePath)
    if (!isPathInsideWorkspace(workspace.rootPath, resolved)) {
      throw new WorkspaceScopeViolationError(`Path escapes workspace root: ${relativePath}`)
    }
    if (workspace.allowedWritePaths.length > 0) {
      const relative = path.relative(workspace.rootPath, resolved)
      const permitted = workspace.allowedWritePaths.some(
        (allowed) => relative === allowed || relative.startsWith(`${allowed}/`),
      )
      if (!permitted) {
        throw new WorkspaceScopeViolationError(
          `Path "${relativePath}" is outside this task's declared write scope.`,
        )
      }
    }
    return resolved
  }

  public async discardWorkspace(workspaceId: string, reason: string): Promise<AgentWorkspace> {
    const workspace = this.getWorkspace(workspaceId)
    if (workspace.mode === 'worktree') {
      const removeResult = await runGitCommand(
        ['worktree', 'remove', '--force', workspace.rootPath],
        workspace.repositoryRoot,
      )
      if (removeResult.exitCode !== 0) {
        rmSync(workspace.rootPath, { recursive: true, force: true })
        await runGitCommand(['worktree', 'prune'], workspace.repositoryRoot)
      }
      if (workspace.branchName !== undefined) {
        await runGitCommand(['branch', '-D', workspace.branchName], workspace.repositoryRoot)
      }
    }
    const updated: AgentWorkspace = {
      ...workspace,
      status: 'discarded',
      discardedAt: this.now().toISOString(),
      discardReason: reason,
    }
    this.store.workspaces.write(workspaceId, updated)
    this.audit('workspace.discarded', workspace.teamId, workspace.agentId, { workspaceId, reason })
    return updated
  }

  private audit(
    type: OrchestrationAuditEvent['type'],
    teamId: string,
    actorPrincipalId: string,
    metadata: Record<string, unknown>,
  ): void {
    const missionId = this.store.teams.read(teamId)?.missionId ?? ''
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      actorPrincipalId,
      metadata,
    }
    this.store.appendAudit(event)
  }
}
