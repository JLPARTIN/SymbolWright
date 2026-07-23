import type { PersistedMissionExecution } from './persistent-mission-executor.js'
import {
  MultiAgentMissionStore,
  type MultiAgentMissionState,
  type SpecialistAgentRole,
  type SpecialistAgentStatus,
} from './multi-agent-mission-runtime.js'
import type { AutonomousTaskNode, AutonomousTaskState } from './task-graph.types.js'

/**
 * Keeps the specialist-agent ledger synchronized with the verified persistent
 * mission executor. It does not execute tasks a second time.
 */
export class MultiAgentExecutionTracker {
  readonly #store: MultiAgentMissionStore

  constructor(store: MultiAgentMissionStore) {
    this.#store = store
  }

  async synchronize(execution: PersistedMissionExecution): Promise<MultiAgentMissionState> {
    const state: MultiAgentMissionState = {
      schemaVersion: 1,
      missionId: execution.graph.missionId,
      objective: execution.graph.objective,
      createdAt: execution.startedAt,
      updatedAt: execution.updatedAt,
      assignments: execution.graph.tasks.map((task) => ({
        agentId: `${roleForTask(task)}-${task.id}`,
        role: roleForTask(task),
        taskId: task.id,
        status: specialistStatusForTask(task.state),
        ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
        ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
        evidence: task.evidence,
        diagnostics: task.failureDiagnostics,
        modifiedFiles: modifiedFilesForTask(task, execution.modifiedFiles),
      })),
    }
    await this.#store.save(state)
    return state
  }
}

export function roleForTask(task: AutonomousTaskNode): SpecialistAgentRole {
  if (task.kind === 'edit-session') return 'code-editor'
  if (task.kind === 'repair') return 'repair-agent'
  if (task.kind === 'validation') return 'test-runner'
  if (task.kind === 'documentation') return 'documentation-agent'
  if (/pull request|pr summary/i.test(task.objective)) return 'pr-summary-agent'
  if (/plan|decompose/i.test(task.objective)) return 'planner'
  return 'repository-analyst'
}

export function specialistStatusForTask(state: AutonomousTaskState): SpecialistAgentStatus {
  if (state === 'completed') return 'completed'
  if (state === 'failed' || state === 'cancelled') return 'failed'
  if (state === 'blocked' || state === 'interrupted') return 'waiting'
  if (state === 'running' || state === 'validating' || state === 'repairing') return 'running'
  return 'idle'
}

function modifiedFilesForTask(
  task: AutonomousTaskNode,
  missionModifiedFiles: readonly string[],
): readonly string[] {
  const declared = missionModifiedFiles.filter((file) => task.resources.writes.includes(file))
  if (declared.length > 0) return declared
  if (
    task.state === 'completed' &&
    (task.kind === 'edit-session' || task.kind === 'repair') &&
    task.resources.writes.length === 0
  ) {
    return missionModifiedFiles
  }
  return []
}
