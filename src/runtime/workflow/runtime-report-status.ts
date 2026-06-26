export type RuntimeReportStatus = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED'

export function statusFromReadiness(readiness: string): RuntimeReportStatus {
  if (readiness === 'READY' || readiness === 'READY_FOR_OPERATOR_REVIEW') {
    return 'READY'
  }

  if (readiness === 'BLOCKED') {
    return 'BLOCKED'
  }

  return 'NEEDS_REVIEW'
}

export function reduceStatuses(statuses: readonly string[]): RuntimeReportStatus {
  if (statuses.includes('BLOCKED')) {
    return 'BLOCKED'
  }

  if (statuses.includes('NEEDS_REVIEW')) {
    return 'NEEDS_REVIEW'
  }

  return 'READY'
}
