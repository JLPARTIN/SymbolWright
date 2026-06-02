export const AJNA_REVIEW_SESSION_BLOCK_ID = 'CODEMIND-AJNA-REVIEW-01' as const
export const AJNA_REVIEW_SESSION_PR_ID = 'PR-CM-AJNA-01' as const
export const AJNA_REVIEW_SESSION_PHASE_ID = 'CODEMIND-AJNA-01' as const

export interface AjnaReviewSessionIdentity {
  readonly repository: string
  readonly pullRequestNumber: number
  readonly headSha: string
  readonly baseSha: string
}

export interface AjnaReviewSession {
  readonly blockId: typeof AJNA_REVIEW_SESSION_BLOCK_ID
  readonly prId: typeof AJNA_REVIEW_SESSION_PR_ID
  readonly phaseId: typeof AJNA_REVIEW_SESSION_PHASE_ID
  readonly sessionId: string
  readonly identity: AjnaReviewSessionIdentity
  readonly createdAtIso: string
  readonly providerInvocationAllowed: false
  readonly repoMutationAllowed: false
  readonly githubWriteAllowed: false
  readonly commandExecutionAllowed: false
}

export interface AjnaReviewSessionInput {
  readonly identity: AjnaReviewSessionIdentity
  /** ISO timestamp — omit for deterministic output. */
  readonly createdAtIso?: string
}

function deriveSessionId(identity: AjnaReviewSessionIdentity): string {
  const shortSha = identity.headSha.slice(0, 12)
  return `${identity.repository}#${identity.pullRequestNumber}@${shortSha}`
}

export function buildAjnaReviewSession(input: AjnaReviewSessionInput): AjnaReviewSession {
  const { identity } = input

  if (!identity.repository || identity.repository.trim() === '') {
    throw new Error('AjnaReviewSession: identity.repository is required')
  }
  if (!Number.isInteger(identity.pullRequestNumber) || identity.pullRequestNumber <= 0) {
    throw new Error('AjnaReviewSession: identity.pullRequestNumber must be a positive integer')
  }
  if (!identity.headSha || identity.headSha.trim() === '') {
    throw new Error('AjnaReviewSession: identity.headSha is required')
  }
  if (!identity.baseSha || identity.baseSha.trim() === '') {
    throw new Error('AjnaReviewSession: identity.baseSha is required')
  }

  return {
    blockId: AJNA_REVIEW_SESSION_BLOCK_ID,
    prId: AJNA_REVIEW_SESSION_PR_ID,
    phaseId: AJNA_REVIEW_SESSION_PHASE_ID,
    sessionId: deriveSessionId(identity),
    identity,
    createdAtIso: input.createdAtIso ?? '',
    providerInvocationAllowed: false,
    repoMutationAllowed: false,
    githubWriteAllowed: false,
    commandExecutionAllowed: false,
  }
}
