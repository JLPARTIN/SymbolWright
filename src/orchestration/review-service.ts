import { randomUUID } from 'node:crypto'

import type { OrchestrationStore } from './orchestration-store.js'
import type { OrchestrationAuditEvent } from './orchestration-types.js'
import type {
  CandidateReview,
  ReviewFinding,
  ReviewFindingSeverity,
} from './change-candidate-types.js'

export class ReviewValidationError extends Error {}
export class SelfReviewNotPermittedError extends Error {}

export interface SubmitFindingInput {
  readonly severity: ReviewFindingSeverity
  readonly summary: string
  readonly filePath?: string
  readonly line?: number
}

export interface SubmitReviewInput {
  readonly candidateId: string
  readonly teamId: string
  readonly reviewerId: string
  readonly findings: readonly SubmitFindingInput[]
  readonly verdict: 'approve' | 'request-changes' | 'reject'
  readonly rationale: string
}

/**
 * Peer review of `ChangeCandidate`s (Section 18). An implementation agent can never be the sole
 * approving reviewer of its own work (Section 18, negative test list, AC14) — this is enforced
 * flatly here (self-review is refused outright, not merely "not sufficient alone") so there is no
 * path, race, or ordering trick that lets a candidate's own author supply its only approval.
 */
export class ReviewService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public submitReview(input: SubmitReviewInput): CandidateReview {
    const candidate = this.store.candidates.read(input.candidateId)
    if (candidate === undefined) {
      throw new ReviewValidationError(`No such candidate: ${input.candidateId}`)
    }
    if (candidate.agentId === input.reviewerId) {
      this.audit(
        'review.self_review_rejected',
        input.teamId,
        candidate.missionId,
        input.reviewerId,
        input.candidateId,
      )
      throw new SelfReviewNotPermittedError(
        `Member "${input.reviewerId}" authored candidate "${input.candidateId}" and may not review its own work.`,
      )
    }

    const findings: ReviewFinding[] = input.findings.map((finding) => ({
      id: randomUUID(),
      severity: finding.severity,
      summary: finding.summary,
      status: 'open',
      ...(finding.filePath === undefined ? {} : { filePath: finding.filePath }),
      ...(finding.line === undefined ? {} : { line: finding.line }),
    }))

    const review: CandidateReview = {
      id: randomUUID(),
      candidateId: input.candidateId,
      teamId: input.teamId,
      reviewerId: input.reviewerId,
      createdAt: this.now().toISOString(),
      findings,
      verdict: input.verdict,
      rationale: input.rationale,
    }
    this.store.reviews.write(review.id, review)
    this.store.candidates.write(input.candidateId, { ...candidate, status: 'under-review' })
    this.audit(
      'review.submitted',
      input.teamId,
      candidate.missionId,
      input.reviewerId,
      input.candidateId,
    )
    return review
  }

  public listForCandidate(candidateId: string): readonly CandidateReview[] {
    return this.store.reviewsByCandidate(candidateId)
  }

  /** True while any review's finding is still `blocking` and `open` — integration must wait. */
  public hasOpenBlockingFindings(candidateId: string): boolean {
    return this.store
      .reviewsByCandidate(candidateId)
      .some((review) =>
        review.findings.some((f) => f.severity === 'blocking' && f.status === 'open'),
      )
  }

  /** At least one independent (non-author) `approve` verdict, with no open blocking findings. */
  public hasIndependentApproval(candidateId: string): boolean {
    const candidate = this.store.candidates.read(candidateId)
    if (candidate === undefined) return false
    if (this.hasOpenBlockingFindings(candidateId)) return false
    return this.store
      .reviewsByCandidate(candidateId)
      .some((review) => review.verdict === 'approve' && review.reviewerId !== candidate.agentId)
  }

  public dismissFinding(
    reviewId: string,
    findingId: string,
    dismissedBy: string,
    evidence: string,
  ): CandidateReview {
    const review = this.store.reviews.read(reviewId)
    if (review === undefined) throw new ReviewValidationError(`No such review: ${reviewId}`)
    if (evidence.trim().length === 0) {
      throw new ReviewValidationError('Dismissing a finding requires non-empty evidence.')
    }
    const findings = review.findings.map((finding) =>
      finding.id === findingId
        ? { ...finding, status: 'dismissed' as const, dismissedBy, dismissalEvidence: evidence }
        : finding,
    )
    const updated: CandidateReview = { ...review, findings }
    this.store.reviews.write(reviewId, updated)
    return updated
  }

  /** Operator override of a blocking finding — the one channel Section 18 allows besides a fix. */
  public overrideFinding(reviewId: string, findingId: string, operatorId: string): CandidateReview {
    const review = this.store.reviews.read(reviewId)
    if (review === undefined) throw new ReviewValidationError(`No such review: ${reviewId}`)
    const findings = review.findings.map((finding) =>
      finding.id === findingId
        ? { ...finding, status: 'overridden' as const, dismissedBy: operatorId }
        : finding,
    )
    return this.persist(reviewId, { ...review, findings })
  }

  private persist(reviewId: string, review: CandidateReview): CandidateReview {
    this.store.reviews.write(reviewId, review)
    return review
  }

  private audit(
    type: OrchestrationAuditEvent['type'],
    teamId: string,
    missionId: string,
    actorPrincipalId: string,
    candidateId: string,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      candidateId,
      actorPrincipalId,
    }
    this.store.appendAudit(event)
  }
}
