import { randomUUID } from 'node:crypto'

import type { OrchestrationStore } from './orchestration-store.js'
import type { OrchestrationAuditEvent, OrchestrationAuditEventType } from './orchestration-types.js'
import type {
  CollaborativeTask,
  CollaborativeTaskStatus,
  CreateCollaborativeTaskInput,
} from './collaborative-task-types.js'

export class TaskValidationError extends Error {}
export class TaskNotFoundError extends Error {}

/**
 * CRUD and dependency-readiness for `CollaborativeTask`s. This is a purpose-built collaborative
 * task type (Section 10), not a duplicate of the existing single-agent `src/autonomy/task-graph.ts`
 * — that graph plans and executes one agent's own mission; this one coordinates multiple
 * independently authorized agents around one team's shared objective, with role/capability
 * requirements and multi-agent assignment policies the single-agent graph has no concept of.
 */
export class CollaborativeTaskService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public createTask(
    missionId: string,
    teamId: string,
    input: CreateCollaborativeTaskInput,
    actor: string,
  ): CollaborativeTask {
    if (input.title.trim().length === 0) throw new TaskValidationError('Task title is required.')
    const dependencies = [...new Set(input.dependencies ?? [])]
    for (const depId of dependencies) {
      if (this.store.tasks.read(depId) === undefined) {
        throw new TaskValidationError(`Unknown dependency task id: ${depId}`)
      }
    }
    const nowIso = this.now().toISOString()
    const task: CollaborativeTask = {
      id: randomUUID(),
      missionId,
      teamId,
      title: input.title,
      objective: input.objective,
      taskType: input.taskType,
      dependencies,
      blockedBy: [...dependencies],
      requiredCapabilities: [...(input.requiredCapabilities ?? [])],
      requiredSpecializations: [...(input.requiredSpecializations ?? [])],
      repositoryScope: [...(input.repositoryScope ?? [])],
      executionMode: input.executionMode,
      assignmentPolicy: input.assignmentPolicy,
      assignedAgentIds: [],
      candidateOutputIds: [],
      status: dependencies.length === 0 ? 'ready' : 'queued',
      acceptanceCriteria: [...(input.acceptanceCriteria ?? [])],
      validationCommands: [...(input.validationCommands ?? [])],
      retryPolicy: { maxAttempts: input.maxRetryAttempts ?? 2, attempts: 0 },
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(input.requiredRole === undefined ? {} : { requiredRole: input.requiredRole }),
      ...(input.readPaths === undefined ? {} : { readPaths: [...input.readPaths] }),
      ...(input.writePaths === undefined ? {} : { writePaths: [...input.writePaths] }),
    }
    this.store.tasks.write(task.id, task)
    this.audit('task.created', teamId, missionId, actor, { taskId: task.id })
    return task
  }

  public getTask(taskId: string): CollaborativeTask {
    const task = this.store.tasks.read(taskId)
    if (task === undefined) throw new TaskNotFoundError(`No such task: ${taskId}`)
    return task
  }

  public listTasksForTeam(teamId: string): readonly CollaborativeTask[] {
    return this.store.tasksByTeam(teamId)
  }

  /** A task is ready once every dependency has reached a terminal accepted state. */
  public refreshReadiness(teamId: string): readonly CollaborativeTask[] {
    const tasks = this.store.tasksByTeam(teamId)
    const byId = new Map(tasks.map((task) => [task.id, task]))
    const updated: CollaborativeTask[] = []
    for (const task of tasks) {
      if (task.status !== 'queued' && task.status !== 'blocked') continue
      const stillBlocked = task.dependencies.filter((depId) => {
        const dep = byId.get(depId)
        return dep === undefined || (dep.status !== 'integrated' && dep.status !== 'accepted')
      })
      if (stillBlocked.length === task.blockedBy.length) continue
      const next: CollaborativeTask = {
        ...task,
        blockedBy: stillBlocked,
        status: stillBlocked.length === 0 ? 'ready' : 'blocked',
        updatedAt: this.now().toISOString(),
      }
      this.store.tasks.write(task.id, next)
      updated.push(next)
    }
    return updated
  }

  public setStatus(taskId: string, status: CollaborativeTaskStatus): CollaborativeTask {
    const task = this.getTask(taskId)
    const updated: CollaborativeTask = { ...task, status, updatedAt: this.now().toISOString() }
    this.store.tasks.write(taskId, updated)
    return updated
  }

  public assignAgents(taskId: string, agentIds: readonly string[]): CollaborativeTask {
    const task = this.getTask(taskId)
    const updated: CollaborativeTask = {
      ...task,
      assignedAgentIds: [...new Set([...task.assignedAgentIds, ...agentIds])],
      status: 'assigned',
      updatedAt: this.now().toISOString(),
    }
    this.store.tasks.write(taskId, updated)
    return updated
  }

  public recordCandidate(taskId: string, candidateId: string): CollaborativeTask {
    const task = this.getTask(taskId)
    const updated: CollaborativeTask = {
      ...task,
      candidateOutputIds: [...task.candidateOutputIds, candidateId],
      status: 'submitted',
      updatedAt: this.now().toISOString(),
    }
    this.store.tasks.write(taskId, updated)
    return updated
  }

  /**
   * Creates a repair task for a failed validation/integration step (Section 26). The repair
   * budget is enforced by the caller (`integration-engine.ts`) via `TeamBudget.maxRepairAttempts`
   * — this method only records the new task, it never decides whether one more is allowed.
   */
  public createRepairTask(
    missionId: string,
    teamId: string,
    failedTaskId: string,
    reason: string,
    actor: string,
  ): CollaborativeTask {
    const failed = this.getTask(failedTaskId)
    const task = this.createTask(
      missionId,
      teamId,
      {
        title: `Repair: ${failed.title}`,
        objective: `Fix the validation/integration failure: ${reason}`,
        taskType: 'repair',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'single-agent',
        repositoryScope: failed.repositoryScope,
        validationCommands: failed.validationCommands,
        ...(failed.writePaths === undefined ? {} : { writePaths: failed.writePaths }),
      },
      actor,
    )
    const withRepairOf: CollaborativeTask = { ...task, repairOfTaskId: failedTaskId }
    this.store.tasks.write(task.id, withRepairOf)
    return withRepairOf
  }

  private audit(
    type: OrchestrationAuditEventType,
    teamId: string,
    missionId: string,
    actorPrincipalId: string,
    metadata?: Record<string, unknown>,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      actorPrincipalId,
      ...(metadata === undefined ? {} : { metadata }),
    }
    this.store.appendAudit(event)
  }
}
