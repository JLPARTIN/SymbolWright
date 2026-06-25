export type OperatorReviewAction =
  | 'post_pr_comment'
  | 'apply_label'
  | 'request_review'
  | 'submit_review'
  | 'create_pr'
  | 'merge_pr'

export interface OperatorReviewPacket {
  readonly id: string
  readonly timestamp: string
  readonly sourceEvidence: readonly string[]
  readonly proposedAction: OperatorReviewAction
  readonly actionDetail: string
  readonly risks: readonly string[]
  readonly validation: readonly string[]
  readonly boundary: readonly string[]
  readonly nextManualStep: string
}

export function createOperatorReviewPacket(input: {
  readonly id: string
  readonly sourceEvidence: readonly string[]
  readonly proposedAction: OperatorReviewAction
  readonly actionDetail: string
  readonly risks: readonly string[]
  readonly validation: readonly string[]
  readonly boundary: readonly string[]
  readonly nextManualStep: string
}): OperatorReviewPacket {
  return {
    id: input.id,
    timestamp: new Date().toISOString(),
    sourceEvidence: input.sourceEvidence,
    proposedAction: input.proposedAction,
    actionDetail: input.actionDetail,
    risks: input.risks,
    validation: input.validation,
    boundary: input.boundary,
    nextManualStep: input.nextManualStep,
  }
}

export function renderOperatorReviewPacket(packet: OperatorReviewPacket): string {
  const sections: string[] = [
    'CodeMind operator review packet',
    '',
    `Packet ID: ${packet.id}`,
    `Timestamp: ${packet.timestamp}`,
    `Proposed action: ${packet.proposedAction}`,
    `Detail: ${packet.actionDetail}`,
  ]

  if (packet.sourceEvidence.length > 0) {
    sections.push('', 'Source evidence:')
    sections.push(...packet.sourceEvidence.map((item) => `- ${item}`))
  }

  if (packet.risks.length > 0) {
    sections.push('', 'Risks:')
    sections.push(...packet.risks.map((risk) => `- ${risk}`))
  }

  if (packet.validation.length > 0) {
    sections.push('', 'Validation:')
    sections.push(...packet.validation.map((item) => `- ${item}`))
  }

  if (packet.boundary.length > 0) {
    sections.push('', 'Boundary:')
    sections.push(...packet.boundary.map((item) => `- ${item}`))
  }

  sections.push('', `Next manual step: ${packet.nextManualStep}`)

  sections.push(
    '',
    'Status: PENDING_OPERATOR_REVIEW',
    'This packet requires operator confirmation before any action is taken.',
  )

  return sections.join('\n')
}
