export const AGENT_KERNEL_BLOCK_ID = 'AGENT-KERNEL-01' as const
export const AGENT_KERNEL_PR_ID = 'PR-AK-01' as const
export const AGENT_KERNEL_PHASE_ID = 'Phase-16G-AK-01' as const

export const AGENT_KERNEL_PHASES = [
  'INTAKE',
  'GOVERNANCE_PREFLIGHT',
  'ROLE_ASSIGNMENT',
  'SKILL_SELECTION',
  'WORKFLOW_PLANNING',
  'CONTEXT_PACKING',
  'PATCH_PROPOSAL_PLANNING',
  'VALIDATION_PLANNING',
  'OPERATOR_CHECKPOINT',
] as const
export type AgentKernelPhase = (typeof AGENT_KERNEL_PHASES)[number]

export const AGENT_KERNEL_ROLES = [
  'orchestrator',
  'researcher',
  'coder',
  'validator',
  'scheduler',
  'memory-auditor',
] as const
export type AgentKernelRole = (typeof AGENT_KERNEL_ROLES)[number]

export const AGENT_KERNEL_MEMORY_SCOPES = ['isolated', 'shared-read-only', 'export-only'] as const
export type AgentKernelMemoryScope = (typeof AGENT_KERNEL_MEMORY_SCOPES)[number]

export const AGENT_KERNEL_SKILL_RISK_CLASSES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type AgentKernelSkillRiskClass = (typeof AGENT_KERNEL_SKILL_RISK_CLASSES)[number]

export const AGENT_KERNEL_STEP_KINDS = [
  'read-context',
  'plan-only',
  'patch-proposal',
  'validation-plan',
  'operator-checkpoint',
] as const
export type AgentKernelStepKind = (typeof AGENT_KERNEL_STEP_KINDS)[number]

export interface AgentKernelRoleProfile {
  readonly role: AgentKernelRole
  readonly memoryScope: AgentKernelMemoryScope
  readonly responsibilities: readonly string[]
  readonly blockedActions: readonly string[]
}

export interface AgentKernelSkillDeclaration {
  readonly skillId: string
  readonly displayName: string
  readonly allowedToolCategories: readonly string[]
  readonly blockedToolCategories: readonly string[]
  readonly outputTypes: readonly string[]
  readonly riskClass: AgentKernelSkillRiskClass
  readonly approvalRequired: boolean
  readonly tags: readonly string[]
}

export interface AgentKernelWorkflowStep {
  readonly stepId: string
  readonly kind: AgentKernelStepKind
  readonly role: AgentKernelRole
  readonly skillId?: string
  readonly summary: string
  readonly approvalCheckpoint: boolean
  readonly allowedToMutate: boolean
}

export interface AgentKernelPlanningRequest {
  readonly requestId: string
  readonly sessionId: string
  readonly operatorIntent: string
  readonly targetRepository?: string
  readonly targetRef?: string
  readonly requestedMode: 'PLAN' | 'READ_ONLY' | 'PATCH_PROPOSAL' | 'PR_REVIEW' | 'CI_REVIEW'
  readonly requestedRoles: readonly AgentKernelRole[]
  readonly requestedSkills: readonly string[]
  readonly allowPatchProposal: boolean
}

export interface AgentKernelPlanningDecision {
  readonly requestId: string
  readonly accepted: boolean
  readonly blockId: typeof AGENT_KERNEL_BLOCK_ID
  readonly prId: typeof AGENT_KERNEL_PR_ID
  readonly phaseId: typeof AGENT_KERNEL_PHASE_ID
  readonly phases: readonly AgentKernelPhase[]
  readonly roleProfiles: readonly AgentKernelRoleProfile[]
  readonly selectedSkills: readonly AgentKernelSkillDeclaration[]
  readonly workflowSteps: readonly AgentKernelWorkflowStep[]
  readonly operatorCheckpoints: readonly string[]
  readonly blockedReasons: readonly string[]
  readonly doctrineNotes: readonly string[]
  readonly sourceLineage: readonly string[]
}
