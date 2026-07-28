/**
 * Multi-Agent Engineering Orchestration — core team/role/trust type model.
 *
 * Builds on the delegated-agent-access subsystem (`src/access/`, Large PR
 * Bundle #10): every `AgentTeamMember` is backed by its own `Principal` and
 * `AgentAccessGrant`. This module defines no parallel authentication or
 * authorization system — every mutating orchestration operation is checked
 * through `AuthorizationService` using the member's own grant.
 */

import {
  parseMicrodollars,
  serializeMicrodollars,
  usdToMicrodollars,
} from '../access/microdollars.js'

export const AGENT_PROVIDER_KINDS = [
  'symbolwright-native',
  'openai',
  'anthropic',
  'google',
  'local-model',
  'mcp-client',
  'remote-agent',
  'human-participant',
  'custom-provider',
] as const
export type AgentProviderKind = (typeof AGENT_PROVIDER_KINDS)[number]

export const AGENT_TRUST_TIERS = [
  'untrusted',
  'restricted',
  'standard',
  'trusted',
  'operator-controlled',
] as const
export type AgentTrustTier = (typeof AGENT_TRUST_TIERS)[number]

/** Trust tier rank, low to high — used for ordering/comparison, never for granting capabilities. */
export const TRUST_TIER_RANK: Readonly<Record<AgentTrustTier, number>> = {
  untrusted: 0,
  restricted: 1,
  standard: 2,
  trusted: 3,
  'operator-controlled': 4,
}

export const BUILTIN_AGENT_ROLES = [
  'lead-orchestrator',
  'repository-investigator',
  'architecture-specialist',
  'implementation-agent',
  'test-engineer',
  'security-reviewer',
  'reliability-specialist',
  'performance-specialist',
  'adversarial-reviewer',
  'integration-agent',
  'validation-agent',
] as const
export type BuiltinAgentRole = (typeof BUILTIN_AGENT_ROLES)[number]

/** A built-in role id, or `custom:<name>` for an operator-defined role (see `agent-roles.ts`). */
export type AgentRole = BuiltinAgentRole | `custom:${string}`

export const TEAM_STATUSES = [
  'forming',
  'planning',
  'running',
  'integrating',
  'validating',
  'awaiting-approval',
  'completed',
  'failed',
  'paused',
  'cancelled',
] as const
export type TeamStatus = (typeof TEAM_STATUSES)[number]

export const TEAM_MEMBER_STATUSES = [
  'invited',
  'ready',
  'working',
  'waiting',
  'reviewing',
  'blocked',
  'failed',
  'completed',
  'removed',
] as const
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number]

export interface AgentResourceLimits {
  readonly maxWallClockMinutes?: number
  readonly maxModelTokens?: number
  /** Canonical base-10 microdollar string at JSON/API boundaries. */
  readonly maxEstimatedCostMicrodollars?: string
  readonly maxToolInvocations?: number
  readonly maxDiffLines?: number
  readonly maxFilesChanged?: number
}

export interface TeamBudget {
  readonly maxTeamSize: number
  readonly maxWallClockMinutes: number
  readonly maxAgentRuns: number
  readonly maxConcurrentAgents: number
  readonly maxModelTokens?: number
  /** Canonical base-10 microdollar string at JSON/API boundaries. */
  readonly maxEstimatedCostMicrodollars?: string
  readonly maxSandboxMinutes: number
  readonly maxRepairAttempts: number
  readonly maxCandidateImplementationsPerTask: number
}

/** Secure defaults per Section 47 of the mission brief — every field explicit, nothing implicit. */
export const DEFAULT_TEAM_BUDGET: TeamBudget = {
  maxTeamSize: 8,
  maxWallClockMinutes: 180,
  maxAgentRuns: 40,
  maxConcurrentAgents: 3,
  maxSandboxMinutes: 90,
  maxRepairAttempts: 3,
  maxCandidateImplementationsPerTask: 3,
}

export interface TeamBudgetUsage {
  agentRuns: number
  wallClockMinutesUsed: number
  sandboxMinutesUsed: number
  repairAttemptsUsed: number
  estimatedCostMicrodollars: string
  modelTokensUsed: number
}

export function zeroBudgetUsage(): TeamBudgetUsage {
  return {
    agentRuns: 0,
    wallClockMinutesUsed: 0,
    sandboxMinutesUsed: 0,
    repairAttemptsUsed: 0,
    estimatedCostMicrodollars: '0',
    modelTokensUsed: 0,
  }
}

interface LegacyMoneyFields {
  readonly maxEstimatedCostUsd?: unknown
  readonly estimatedCostUsd?: unknown
}

function legacyUsdToSerializedMicrodollars(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? serializeMicrodollars(usdToMicrodollars(value))
    : undefined
}

export function normalizeAgentResourceLimits(
  raw: AgentResourceLimits & LegacyMoneyFields,
): AgentResourceLimits {
  const legacy = legacyUsdToSerializedMicrodollars(raw.maxEstimatedCostUsd)
  const configured = raw.maxEstimatedCostMicrodollars
  const normalized =
    configured === undefined ? legacy : serializeMicrodollars(parseMicrodollars(configured))
  const { maxEstimatedCostUsd: _legacy, ...rest } = raw as AgentResourceLimits &
    LegacyMoneyFields &
    Record<string, unknown>
  return {
    ...rest,
    ...(normalized === undefined ? {} : { maxEstimatedCostMicrodollars: normalized }),
  } as AgentResourceLimits
}

export function normalizeTeamBudget(raw: TeamBudget & LegacyMoneyFields): TeamBudget {
  const legacy = legacyUsdToSerializedMicrodollars(raw.maxEstimatedCostUsd)
  const configured = raw.maxEstimatedCostMicrodollars
  const normalized =
    configured === undefined ? legacy : serializeMicrodollars(parseMicrodollars(configured))
  const { maxEstimatedCostUsd: _legacy, ...rest } = raw as TeamBudget &
    LegacyMoneyFields &
    Record<string, unknown>
  return {
    ...rest,
    ...(normalized === undefined ? {} : { maxEstimatedCostMicrodollars: normalized }),
  } as TeamBudget
}

export function normalizeTeamBudgetUsage(
  raw: TeamBudgetUsage & LegacyMoneyFields,
): TeamBudgetUsage {
  const legacy = legacyUsdToSerializedMicrodollars(raw.estimatedCostUsd)
  const configured = raw.estimatedCostMicrodollars
  const normalized = serializeMicrodollars(parseMicrodollars(configured ?? legacy ?? '0'))
  const { estimatedCostUsd: _legacy, ...rest } = raw as TeamBudgetUsage &
    LegacyMoneyFields &
    Record<string, unknown>
  return { ...rest, estimatedCostMicrodollars: normalized } as TeamBudgetUsage
}

export function normalizePersistedAgentTeam(team: AgentTeam): AgentTeam {
  return {
    ...team,
    budget: normalizeTeamBudget(team.budget as TeamBudget & LegacyMoneyFields),
    usage: normalizeTeamBudgetUsage(team.usage as TeamBudgetUsage & LegacyMoneyFields),
  }
}

export function normalizePersistedAgentTeamMember(member: AgentTeamMember): AgentTeamMember {
  return {
    ...member,
    resourceLimits: normalizeAgentResourceLimits(
      member.resourceLimits as AgentResourceLimits & LegacyMoneyFields,
    ),
  }
}

export interface TeamMetrics {
  tasksTotal: number
  tasksCompleted: number
  tasksFailed: number
  candidatesSubmitted: number
  candidatesAccepted: number
  candidatesRejected: number
  reviewsCompleted: number
  blockingFindingsOpen: number
  integrationsExecuted: number
  integrationsRolledBack: number
}

export function zeroTeamMetrics(): TeamMetrics {
  return {
    tasksTotal: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    candidatesSubmitted: 0,
    candidatesAccepted: 0,
    candidatesRejected: 0,
    reviewsCompleted: 0,
    blockingFindingsOpen: 0,
    integrationsExecuted: 0,
    integrationsRolledBack: 0,
  }
}

export interface AgentTeam {
  readonly id: string
  readonly missionId: string
  readonly repositoryRoot: string
  name: string
  objective: string
  status: TeamStatus
  readonly createdBy: string
  /** The authenticated grant that created this team, when created by a delegated agent
   * (undefined = operator-created, or a team persisted before this field existed -- both are
   * treated as operator-owned by `team-access-guard.ts`, never inferred from `createdBy`'s
   * free-form display string). Distinct from mission ownership: a team can be owned by a
   * different grant than the mission it targets, as long as that grant could manage the
   * mission at creation time. */
  readonly ownerGrantId?: string
  readonly ownerPrincipalId?: string
  readonly createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  readonly budget: TeamBudget
  usage: TeamBudgetUsage
  metrics: TeamMetrics
  /** Root of the one canonical integration workspace this team's accepted work converges into. */
  integrationWorkspaceId?: string
  /** Explicit, human-recorded risks the mission completion gate did not force closed. */
  unresolvedRisks: string[]
  version: number
}

export interface AgentTeamMember {
  readonly id: string
  readonly teamId: string
  readonly principalId: string
  readonly grantId: string
  role: AgentRole
  readonly provider: AgentProviderKind
  specialization: string[]
  status: TeamMemberStatus
  assignedTaskIds: string[]
  readonly trustTier: AgentTrustTier
  readonly concurrencyLimit: number
  readonly resourceLimits: AgentResourceLimits
  readonly createdAt: string
  updatedAt: string
  removedAt?: string
  removedReason?: string
}

export const ORCHESTRATION_AUDIT_EVENT_TYPES = [
  'team.created',
  'team.started',
  'team.paused',
  'team.resumed',
  'team.cancelled',
  'team.completed',
  'team.failed',
  'member.added',
  'member.removed',
  'task.created',
  'task.assigned',
  'task.assignment.unresolved',
  'workspace.created',
  'workspace.discarded',
  'context.entry.added',
  'context.entry.promoted',
  'context.entry.rejected',
  'message.sent',
  'candidate.submitted',
  'candidate.rejected',
  'candidate.accepted',
  'review.submitted',
  'review.self_review_rejected',
  'conflict.detected',
  'integration.prepared',
  'integration.executed',
  'integration.rolled_back',
  'budget.exceeded',
  'authorization.denied',
] as const
export type OrchestrationAuditEventType = (typeof ORCHESTRATION_AUDIT_EVENT_TYPES)[number]

/** Mirrors `AuditEvent`'s shape (`src/access/access-types.ts`) for the orchestration domain's own
 * event vocabulary, so team/task/candidate/review/integration history is reconstructable without
 * overloading the delegated-access subsystem's closed `AuditEventType` union with unrelated events. */
export interface OrchestrationAuditEvent {
  readonly id: string
  readonly type: OrchestrationAuditEventType
  readonly timestamp: string
  readonly missionId: string
  readonly teamId: string
  readonly actorPrincipalId: string
  readonly taskId?: string
  readonly candidateId?: string
  readonly correlationId?: string
  readonly reasonCode?: string
  readonly metadata?: Record<string, unknown>
}

export interface CreateTeamMemberInput {
  readonly displayName: string
  readonly principalType: 'human' | 'llm' | 'coding-agent' | 'mcp-client' | 'automation'
  readonly role: AgentRole
  readonly provider: AgentProviderKind
  readonly specialization?: readonly string[]
  readonly trustTier: AgentTrustTier
  readonly concurrencyLimit?: number
  readonly resourceLimits?: AgentResourceLimits
  /** Which delegated-access permission profile backs this member's grant (see `src/access/access-profiles.ts`). */
  readonly accessProfileId: string
  readonly issuedBy: string
}
