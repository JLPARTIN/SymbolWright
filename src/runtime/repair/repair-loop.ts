export type RepairLoopCheckpoint =
  | 'AJNA_FINDING'
  | 'PATCH_PROPOSED'
  | 'OPERATOR_REVIEWED'
  | 'PATCH_APPLIED'
  | 'VALIDATION_RUN'
  | 'AJNA_REASSESSED'
  | 'MERGE_READINESS_ASSESSED'

export type RepairLoopOutcome =
  | 'COMPLETED'
  | 'STOPPED_AT_CHECKPOINT'
  | 'BLOCKED'
  | 'VALIDATION_FAILED'

export interface RepairLoopFinding {
  readonly id: string
  readonly category: string
  readonly message: string
  readonly severity: string
  readonly filePath: string | undefined
}

export interface RepairLoopPatchProposal {
  readonly reason: string
  readonly rollbackNote: string
  readonly files: readonly {
    readonly targetPath: string
    readonly content: string
  }[]
}

export interface RepairLoopOperatorReview {
  readonly decision: 'APPROVED' | 'REJECTED'
  readonly reviewedBy: string
  readonly notes: string
}

export interface RepairLoopValidationResult {
  readonly command: string
  readonly exitCode: number
  readonly passed: boolean
  readonly summary: string
}

export interface RepairLoopAjnaReassessment {
  readonly verdict: string
  readonly blockers: readonly string[]
  readonly readiness: string
}

export interface RepairLoopRequest {
  readonly finding: RepairLoopFinding
  readonly patchProposal: RepairLoopPatchProposal
  readonly operatorReview: RepairLoopOperatorReview | undefined
  readonly validationResults: readonly RepairLoopValidationResult[]
  readonly ajnaReassessment: RepairLoopAjnaReassessment | undefined
  readonly stopAtCheckpoint: RepairLoopCheckpoint | undefined
}

export interface RepairLoopResult {
  readonly outcome: RepairLoopOutcome
  readonly lastCheckpoint: RepairLoopCheckpoint
  readonly finding: RepairLoopFinding
  readonly patchProposed: boolean
  readonly operatorApproved: boolean | undefined
  readonly patchApplied: boolean
  readonly validationPassed: boolean | undefined
  readonly ajnaReassessment: RepairLoopAjnaReassessment | undefined
  readonly blockReasons: readonly string[]
}

export function executeRepairLoop(request: RepairLoopRequest): RepairLoopResult {
  const blockReasons: string[] = []

  if (request.finding.id.trim().length === 0) {
    blockReasons.push('Finding ID must not be empty.')
  }

  if (request.finding.message.trim().length === 0) {
    blockReasons.push('Finding message must not be empty.')
  }

  if (blockReasons.length > 0) {
    return blocked('AJNA_FINDING', request.finding, blockReasons)
  }

  if (request.stopAtCheckpoint === 'AJNA_FINDING') {
    return stoppedAt('AJNA_FINDING', request.finding)
  }

  if (request.patchProposal.files.length === 0) {
    blockReasons.push('Patch proposal must include at least one file.')
  }

  if (request.patchProposal.reason.trim().length === 0) {
    blockReasons.push('Patch proposal must include a reason.')
  }

  if (request.patchProposal.rollbackNote.trim().length === 0) {
    blockReasons.push('Patch proposal must include a rollback note.')
  }

  if (blockReasons.length > 0) {
    return blocked('PATCH_PROPOSED', request.finding, blockReasons)
  }

  if (request.stopAtCheckpoint === 'PATCH_PROPOSED') {
    return stoppedAt('PATCH_PROPOSED', request.finding)
  }

  if (request.operatorReview === undefined) {
    return blocked('OPERATOR_REVIEWED', request.finding, [
      'Operator review is required before patch application.',
    ])
  }

  if (request.operatorReview.decision === 'REJECTED') {
    return blocked('OPERATOR_REVIEWED', request.finding, [
      `Operator rejected patch: ${request.operatorReview.notes}`,
    ])
  }

  if (request.stopAtCheckpoint === 'OPERATOR_REVIEWED') {
    return stoppedAt('OPERATOR_REVIEWED', request.finding)
  }

  if (request.stopAtCheckpoint === 'PATCH_APPLIED') {
    return {
      outcome: 'STOPPED_AT_CHECKPOINT',
      lastCheckpoint: 'PATCH_APPLIED',
      finding: request.finding,
      patchProposed: true,
      operatorApproved: true,
      patchApplied: false,
      validationPassed: undefined,
      ajnaReassessment: undefined,
      blockReasons: [],
    }
  }

  const allValidationsPassed =
    request.validationResults.length > 0 && request.validationResults.every((v) => v.passed)

  if (request.validationResults.length > 0 && !allValidationsPassed) {
    const failedCommands = request.validationResults
      .filter((v) => !v.passed)
      .map((v) => `${v.command} (exit ${v.exitCode})`)

    return {
      outcome: 'VALIDATION_FAILED',
      lastCheckpoint: 'VALIDATION_RUN',
      finding: request.finding,
      patchProposed: true,
      operatorApproved: true,
      patchApplied: true,
      validationPassed: false,
      ajnaReassessment: undefined,
      blockReasons: [`Validation failed: ${failedCommands.join(', ')}`],
    }
  }

  if (request.stopAtCheckpoint === 'VALIDATION_RUN') {
    return {
      outcome: 'STOPPED_AT_CHECKPOINT',
      lastCheckpoint: 'VALIDATION_RUN',
      finding: request.finding,
      patchProposed: true,
      operatorApproved: true,
      patchApplied: true,
      validationPassed: allValidationsPassed || undefined,
      ajnaReassessment: undefined,
      blockReasons: [],
    }
  }

  if (request.ajnaReassessment === undefined) {
    return blocked('AJNA_REASSESSED', request.finding, [
      'Ajna reassessment is required after validation.',
    ])
  }

  if (request.stopAtCheckpoint === 'AJNA_REASSESSED') {
    return {
      outcome: 'STOPPED_AT_CHECKPOINT',
      lastCheckpoint: 'AJNA_REASSESSED',
      finding: request.finding,
      patchProposed: true,
      operatorApproved: true,
      patchApplied: true,
      validationPassed: allValidationsPassed || undefined,
      ajnaReassessment: request.ajnaReassessment,
      blockReasons: [],
    }
  }

  if (request.ajnaReassessment.blockers.length > 0) {
    return {
      outcome: 'BLOCKED',
      lastCheckpoint: 'MERGE_READINESS_ASSESSED',
      finding: request.finding,
      patchProposed: true,
      operatorApproved: true,
      patchApplied: true,
      validationPassed: allValidationsPassed || undefined,
      ajnaReassessment: request.ajnaReassessment,
      blockReasons: request.ajnaReassessment.blockers.map((b) => `Ajna blocker: ${b}`),
    }
  }

  return {
    outcome: 'COMPLETED',
    lastCheckpoint: 'MERGE_READINESS_ASSESSED',
    finding: request.finding,
    patchProposed: true,
    operatorApproved: true,
    patchApplied: true,
    validationPassed: allValidationsPassed || undefined,
    ajnaReassessment: request.ajnaReassessment,
    blockReasons: [],
  }
}

function blocked(
  checkpoint: RepairLoopCheckpoint,
  finding: RepairLoopFinding,
  reasons: readonly string[],
): RepairLoopResult {
  return {
    outcome: 'BLOCKED',
    lastCheckpoint: checkpoint,
    finding,
    patchProposed: false,
    operatorApproved: undefined,
    patchApplied: false,
    validationPassed: undefined,
    ajnaReassessment: undefined,
    blockReasons: reasons,
  }
}

function stoppedAt(checkpoint: RepairLoopCheckpoint, finding: RepairLoopFinding): RepairLoopResult {
  return {
    outcome: 'STOPPED_AT_CHECKPOINT',
    lastCheckpoint: checkpoint,
    finding,
    patchProposed: checkpoint !== 'AJNA_FINDING',
    operatorApproved: undefined,
    patchApplied: false,
    validationPassed: undefined,
    ajnaReassessment: undefined,
    blockReasons: [],
  }
}

export function renderRepairLoopResult(result: RepairLoopResult): string {
  const lines = [
    'CodeMind Repair Loop',
    '',
    `Outcome: ${result.outcome}`,
    `Last checkpoint: ${result.lastCheckpoint}`,
    `Finding: [${result.finding.severity}] ${result.finding.message}`,
    `Patch proposed: ${result.patchProposed ? 'yes' : 'no'}`,
    `Operator approved: ${result.operatorApproved === undefined ? 'pending' : result.operatorApproved ? 'yes' : 'no'}`,
    `Patch applied: ${result.patchApplied ? 'yes' : 'no'}`,
    `Validation passed: ${result.validationPassed === undefined ? 'not run' : result.validationPassed ? 'yes' : 'no'}`,
  ]

  if (result.ajnaReassessment !== undefined) {
    lines.push(`Ajna verdict: ${result.ajnaReassessment.verdict}`)
    lines.push(`Merge readiness: ${result.ajnaReassessment.readiness}`)
  }

  if (result.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    for (const reason of result.blockReasons) {
      lines.push(`- ${reason}`)
    }
  }

  return lines.join('\n')
}
