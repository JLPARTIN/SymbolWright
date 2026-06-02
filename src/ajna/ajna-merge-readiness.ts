import type {
  AjnaMergeReadiness,
  AjnaMergeReadinessStatus,
  AjnaReviewFinding,
  AjnaReviewRequest,
} from './ajna-review.types.js'

const BLOCKED_STATUSES = new Set<AjnaMergeReadinessStatus>([
  'BLOCKED_BY_RISK',
  'BLOCKED_BY_CI',
  'BLOCKED_BY_SECURITY',
  'BLOCKED_BY_ARCHITECTURE_DRIFT',
])

export function isAjnaBlockedStatus(status: AjnaMergeReadinessStatus): boolean {
  return BLOCKED_STATUSES.has(status)
}

export function canAjnaDeclareMergeReady(readiness: AjnaMergeReadiness): boolean {
  return (
    readiness.status === 'MERGE_READY_WITH_EVIDENCE' &&
    readiness.requiredEvidencePresent &&
    readiness.blockingFindings.length === 0 &&
    !readiness.operatorDecisionRequired
  )
}

export function deriveAjnaMergeReadiness(
  request: AjnaReviewRequest,
  findings: readonly AjnaReviewFinding[],
): AjnaMergeReadiness {
  const blockingFindings = findings
    .filter((finding) => finding.blocksMerge)
    .map((finding) => finding.id)

  const hasSecurityBlocker = findings.some(
    (finding) => finding.blocksMerge && finding.category === 'SECURITY_SENSITIVE_CHANGE',
  )
  const hasArchitectureBlocker = findings.some(
    (finding) => finding.blocksMerge && finding.category === 'ARCHITECTURE_DRIFT',
  )
  const hasCiBlocker = findings.some(
    (finding) => finding.blocksMerge && finding.category === 'CI_SIGNAL',
  )
  const hasTestGap = findings.some((finding) => finding.category === 'TEST_GAP')

  if (hasSecurityBlocker) {
    return {
      status: 'BLOCKED_BY_SECURITY',
      summary: 'Security-sensitive blocking findings must be resolved before merge.',
      requiredEvidencePresent: false,
      blockingFindings,
      operatorDecisionRequired: true,
    }
  }

  if (hasArchitectureBlocker) {
    return {
      status: 'BLOCKED_BY_ARCHITECTURE_DRIFT',
      summary: 'Architecture drift blockers must be resolved before merge.',
      requiredEvidencePresent: false,
      blockingFindings,
      operatorDecisionRequired: true,
    }
  }

  if (hasCiBlocker) {
    return {
      status: 'BLOCKED_BY_CI',
      summary: 'CI blockers must be resolved before merge.',
      requiredEvidencePresent: false,
      blockingFindings,
      operatorDecisionRequired: false,
    }
  }

  if (blockingFindings.length > 0) {
    return {
      status: 'BLOCKED_BY_RISK',
      summary: 'Blocking risk findings must be resolved before merge.',
      requiredEvidencePresent: false,
      blockingFindings,
      operatorDecisionRequired: true,
    }
  }

  if (request.requireTestEvidence && hasTestGap) {
    return {
      status: 'NEEDS_TEST_EVIDENCE',
      summary: 'Required test evidence is missing or incomplete.',
      requiredEvidencePresent: false,
      blockingFindings,
      operatorDecisionRequired: false,
    }
  }

  if (request.requireCiEvidence || request.requireTestEvidence) {
    return {
      status: 'NEEDS_OPERATOR_DECISION',
      summary: 'Evidence gates are configured and require operator confirmation.',
      requiredEvidencePresent: false,
      blockingFindings,
      operatorDecisionRequired: true,
    }
  }

  return {
    status: 'READY_TO_REVIEW',
    summary: 'No blocking findings were detected in the provided contract input.',
    requiredEvidencePresent: false,
    blockingFindings,
    operatorDecisionRequired: false,
  }
}
