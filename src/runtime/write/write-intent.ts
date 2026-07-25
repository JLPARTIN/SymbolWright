export type WriteIntentTarget =
  | 'file_edit'
  | 'file_create'
  | 'file_delete'
  | 'github_pr_comment'
  | 'github_label'
  | 'github_review'
  | 'github_pr_create'

export interface WriteIntent {
  readonly id: string
  readonly target: WriteIntentTarget
  readonly targetPath: string
  readonly reason: string
  readonly expectedDiffSummary: string
  readonly validationPlan: readonly string[]
  readonly approvalTicketRequired: boolean
  readonly rollbackNote: string
}

export function createWriteIntent(input: {
  readonly id: string
  readonly target: WriteIntentTarget
  readonly targetPath: string
  readonly reason: string
  readonly expectedDiffSummary: string
  readonly validationPlan: readonly string[]
  readonly rollbackNote: string
}): WriteIntent {
  return {
    id: input.id,
    target: input.target,
    targetPath: input.targetPath,
    reason: input.reason,
    expectedDiffSummary: input.expectedDiffSummary,
    validationPlan: input.validationPlan,
    approvalTicketRequired: true,
    rollbackNote: input.rollbackNote,
  }
}

export function renderWriteIntent(intent: WriteIntent): string {
  const sections: string[] = [
    'SymbolWright write intent plan',
    '',
    `Intent ID: ${intent.id}`,
    `Target: ${intent.target}`,
    `Path: ${intent.targetPath}`,
    `Reason: ${intent.reason}`,
    `Expected diff: ${intent.expectedDiffSummary}`,
    `Approval required: ${intent.approvalTicketRequired ? 'yes' : 'no'}`,
    `Rollback: ${intent.rollbackNote}`,
  ]

  if (intent.validationPlan.length > 0) {
    sections.push('', 'Validation plan:')
    sections.push(...intent.validationPlan.map((step) => `- ${step}`))
  }

  sections.push(
    '',
    'Status: PLAN_ONLY',
    'This write intent is a plan. No file or service has been modified.',
  )

  return sections.join('\n')
}
