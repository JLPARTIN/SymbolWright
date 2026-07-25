export const SHARED_CONTEXT_CATEGORIES = [
  'authoritative-context',
  'accepted-findings',
  'agent-proposals',
  'rejected-findings',
  'unverified-claims',
] as const
export type SharedContextCategory = (typeof SHARED_CONTEXT_CATEGORIES)[number]

export const CONTEXT_SOURCE_TYPES = [
  'operator',
  'repository',
  'tool-result',
  'agent',
  'validation',
  'policy',
  'integration',
] as const
export type ContextSourceType = (typeof CONTEXT_SOURCE_TYPES)[number]

export const CONTEXT_TRUST_STATUSES = [
  'authoritative',
  'verified',
  'accepted',
  'unverified',
  'rejected',
  'superseded',
] as const
export type ContextTrustStatus = (typeof CONTEXT_TRUST_STATUSES)[number]

/** Trust statuses whose content is safe to feed into downstream planning/assignment automatically. */
export const AUTO_INFLUENTIAL_TRUST_STATUSES: ReadonlySet<ContextTrustStatus> = new Set([
  'authoritative',
  'verified',
  'accepted',
])

export interface SharedContextEntry {
  readonly id: string
  readonly missionId: string
  readonly teamId: string
  category: SharedContextCategory
  readonly content: unknown
  readonly sourceType: ContextSourceType
  /** For `sourceType: 'agent'`, the submitting member's id — always attributed, never anonymous. */
  readonly sourceId: string
  readonly createdBy: string
  readonly createdAt: string
  trustStatus: ContextTrustStatus
  readonly evidenceRefs: readonly string[]
  readonly supersedes?: readonly string[]
  decidedBy?: string
  decidedAt?: string
  decisionRationale?: string
}

export interface AddContextEntryInput {
  readonly missionId: string
  readonly teamId: string
  readonly category: SharedContextCategory
  readonly content: unknown
  readonly sourceType: ContextSourceType
  readonly sourceId: string
  readonly createdBy: string
  readonly evidenceRefs?: readonly string[]
  readonly supersedes?: readonly string[]
  /** Only `operator`, `validation`, and `policy` sources may be authoritative on entry; everything
   * else starts `unverified` and requires an explicit promotion decision (Section 13). */
  readonly initialTrustStatus?: ContextTrustStatus
}

export const COLLABORATION_MESSAGE_TYPES = [
  'task.assignment',
  'task.question',
  'task.response',
  'finding.proposed',
  'finding.accepted',
  'finding.rejected',
  'decision.requested',
  'decision.recorded',
  'interface.proposed',
  'interface.accepted',
  'conflict.detected',
  'review.requested',
  'review.completed',
  'change.submitted',
  'change.rejected',
  'validation.failed',
  'repair.requested',
  'integration.ready',
  'operator.input.requested',
  'agent.status',
] as const
export type CollaborationMessageType = (typeof COLLABORATION_MESSAGE_TYPES)[number]

export interface CollaborationMessage {
  readonly id: string
  readonly missionId: string
  readonly teamId: string
  readonly type: CollaborationMessageType
  /** The authenticated sender member id (or `'operator'`/`'system'`) — never caller-supplied free text. */
  readonly senderId: string
  readonly recipientId?: string
  readonly taskId?: string
  readonly body: Readonly<Record<string, unknown>>
  readonly createdAt: string
  readonly correlationId?: string
}
