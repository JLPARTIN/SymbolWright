export interface PrPreparationInput {
  readonly title: string
  readonly body: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly changedFiles: readonly string[]
  readonly validationChecklist: readonly string[]
  readonly reason: string
}

export type PrPreparationDecision = 'READY' | 'INCOMPLETE'

export interface PrPreparationResult {
  readonly decision: PrPreparationDecision
  readonly title: string
  readonly body: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly changedFiles: readonly string[]
  readonly validationChecklist: readonly PrChecklistItem[]
  readonly reason: string
  readonly issues: readonly string[]
}

export interface PrChecklistItem {
  readonly label: string
  readonly required: boolean
}

export function evaluatePrPreparation(input: PrPreparationInput): PrPreparationResult {
  const issues: string[] = []

  if (input.title.trim().length === 0) {
    issues.push('PR title must not be empty.')
  }

  if (input.body.trim().length === 0) {
    issues.push('PR body must not be empty.')
  }

  if (input.baseBranch.trim().length === 0) {
    issues.push('Base branch must be specified.')
  }

  if (input.headBranch.trim().length === 0) {
    issues.push('Head branch must be specified.')
  }

  if (input.baseBranch.trim() === input.headBranch.trim() && input.baseBranch.trim().length > 0) {
    issues.push('Base branch and head branch must be different.')
  }

  if (input.changedFiles.length === 0) {
    issues.push('At least one changed file must be listed.')
  }

  if (input.validationChecklist.length === 0) {
    issues.push('At least one validation checklist item is required.')
  }

  if (input.reason.trim().length === 0) {
    issues.push('PR preparation must include a reason.')
  }

  const checklistItems: PrChecklistItem[] = input.validationChecklist.map((label) => ({
    label,
    required: true,
  }))

  return {
    decision: issues.length === 0 ? 'READY' : 'INCOMPLETE',
    title: input.title,
    body: input.body,
    baseBranch: input.baseBranch,
    headBranch: input.headBranch,
    changedFiles: input.changedFiles,
    validationChecklist: checklistItems,
    reason: input.reason,
    issues,
  }
}

export function renderPrPreparation(result: PrPreparationResult): string {
  const sections: string[] = [
    'SymbolWright PR preparation',
    '',
    `Decision: ${result.decision}`,
    `Title: ${result.title}`,
    `Base: ${result.baseBranch}`,
    `Head: ${result.headBranch}`,
    `Reason: ${result.reason}`,
  ]

  if (result.changedFiles.length > 0) {
    sections.push('', 'Changed files:')
    sections.push(...result.changedFiles.map((file) => `- ${file}`))
  }

  if (result.validationChecklist.length > 0) {
    sections.push('', 'Validation checklist:')
    sections.push(...result.validationChecklist.map((item) => `- [ ] ${item.label}`))
  }

  if (result.issues.length > 0) {
    sections.push('', 'Issues:')
    sections.push(...result.issues.map((issue) => `- ${issue}`))
  }

  if (result.decision === 'READY') {
    sections.push('', 'Body:', result.body)
  }

  sections.push(
    '',
    'Status: PREPARATION_ONLY',
    'This is a PR preparation preview. No branch has been pushed. No PR has been created.',
  )

  return sections.join('\n')
}
