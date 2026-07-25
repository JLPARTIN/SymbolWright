import type { AgentRole } from './orchestration-types.js'

export const COLLABORATIVE_TASK_TYPES = [
  'investigation',
  'architecture',
  'implementation',
  'test',
  'security-review',
  'reliability-review',
  'performance-review',
  'adversarial-review',
  'integration',
  'validation',
  'repair',
  'documentation',
] as const
export type CollaborativeTaskType = (typeof COLLABORATIVE_TASK_TYPES)[number]

export const TASK_EXECUTION_MODES = [
  'analysis',
  'proposal',
  'isolated-mutation',
  'review',
  'integration',
  'validation',
] as const
export type TaskExecutionMode = (typeof TASK_EXECUTION_MODES)[number]

export const TASK_ASSIGNMENT_POLICIES = [
  'single-agent',
  'competitive',
  'cooperative',
  'review-pair',
  'consensus',
] as const
export type TaskAssignmentPolicy = (typeof TASK_ASSIGNMENT_POLICIES)[number]

export const COLLABORATIVE_TASK_STATUSES = [
  'queued',
  'ready',
  'assigned',
  'running',
  'submitted',
  'reviewing',
  'accepted',
  'rejected',
  'integrated',
  'blocked',
  'failed',
  'cancelled',
] as const
export type CollaborativeTaskStatus = (typeof COLLABORATIVE_TASK_STATUSES)[number]

export interface TaskRetryPolicy {
  readonly maxAttempts: number
  attempts: number
}

export interface CollaborativeTask {
  readonly id: string
  readonly missionId: string
  readonly teamId: string
  title: string
  objective: string
  readonly taskType: CollaborativeTaskType
  dependencies: string[]
  blockedBy: string[]
  requiredRole?: AgentRole
  requiredCapabilities: string[]
  requiredSpecializations: string[]
  repositoryScope: string[]
  readPaths?: string[]
  writePaths?: string[]
  readonly executionMode: TaskExecutionMode
  readonly assignmentPolicy: TaskAssignmentPolicy
  assignedAgentIds: string[]
  candidateOutputIds: string[]
  status: CollaborativeTaskStatus
  acceptanceCriteria: string[]
  validationCommands: string[]
  retryPolicy: TaskRetryPolicy
  readonly createdAt: string
  updatedAt: string
  /** Populated when this task was auto-generated as a repair for a failed validation/integration step. */
  repairOfTaskId?: string
}

export interface CreateCollaborativeTaskInput {
  readonly title: string
  readonly objective: string
  readonly taskType: CollaborativeTaskType
  readonly dependencies?: readonly string[]
  readonly requiredRole?: AgentRole
  readonly requiredCapabilities?: readonly string[]
  readonly requiredSpecializations?: readonly string[]
  readonly repositoryScope?: readonly string[]
  readonly readPaths?: readonly string[]
  readonly writePaths?: readonly string[]
  readonly executionMode: TaskExecutionMode
  readonly assignmentPolicy: TaskAssignmentPolicy
  readonly acceptanceCriteria?: readonly string[]
  readonly validationCommands?: readonly string[]
  readonly maxRetryAttempts?: number
}

export const ASSIGNMENT_STRATEGIES = [
  'best-fit',
  'lowest-cost',
  'lowest-latency',
  'highest-trust',
  'competitive',
  'diverse-model',
  'operator-selected',
] as const
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number]

export interface AssignmentReason {
  readonly memberId: string
  readonly score: number
  readonly factors: Readonly<Record<string, number>>
  readonly selected: boolean
  readonly rejectionReason?: string
}

export interface AgentAssignmentDecision {
  readonly id: string
  readonly teamId: string
  readonly taskId: string
  readonly selectedAgentIds: readonly string[]
  readonly strategy: AssignmentStrategy
  readonly reasons: readonly AssignmentReason[]
  readonly decidedAt: string
  /** Set when no candidate met the task's requirements — a fail-closed outcome, never a silent substitution. */
  readonly unresolved?: boolean
  readonly unresolvedReason?: string
}
