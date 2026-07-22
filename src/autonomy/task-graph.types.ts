export const AUTONOMOUS_TASK_STATES = [
  'queued',
  'blocked',
  'ready',
  'running',
  'validating',
  'repairing',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const

export type AutonomousTaskState = (typeof AUTONOMOUS_TASK_STATES)[number]

export type AutonomousTaskKind =
  | 'repository-analysis'
  | 'semantic-index'
  | 'edit-session'
  | 'validation'
  | 'repair'
  | 'documentation'
  | 'checkpoint'

export interface AutonomousTaskResourceSet {
  readonly reads: readonly string[]
  readonly writes: readonly string[]
}

export interface AutonomousTaskRetryPolicy {
  readonly maxAttempts: number
  readonly attempts: number
}

export interface AutonomousTaskEvidenceReference {
  readonly kind: 'tool-call' | 'validation' | 'checkpoint' | 'edit-session' | 'diagnostic'
  readonly id: string
}

export interface AutonomousTaskNode {
  readonly id: string
  readonly objective: string
  readonly kind: AutonomousTaskKind
  readonly dependencies: readonly string[]
  readonly resources: AutonomousTaskResourceSet
  readonly state: AutonomousTaskState
  readonly retry: AutonomousTaskRetryPolicy
  readonly checkpointId?: string | undefined
  readonly evidence: readonly AutonomousTaskEvidenceReference[]
  readonly artifacts: readonly string[]
  readonly failureDiagnostics: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly startedAt?: string | undefined
  readonly completedAt?: string | undefined
}

export interface AutonomousTaskGraph {
  readonly schemaVersion: 1
  readonly missionId: string
  readonly objective: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly tasks: readonly AutonomousTaskNode[]
}

export interface AutonomousTaskGraphFinding {
  readonly code:
    | 'DUPLICATE_TASK_ID'
    | 'MISSING_DEPENDENCY'
    | 'SELF_DEPENDENCY'
    | 'DEPENDENCY_CYCLE'
    | 'INVALID_RETRY_POLICY'
  readonly taskId: string
  readonly message: string
}

export interface AutonomousTaskGraphValidation {
  readonly valid: boolean
  readonly findings: readonly AutonomousTaskGraphFinding[]
}
