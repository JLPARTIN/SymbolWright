export const ALLOWED_GITHUB_WRITE_ACTIONS = [
  'create_draft_pr',
  'post_comment',
  'apply_label',
] as const

export type AllowedGitHubWriteAction = (typeof ALLOWED_GITHUB_WRITE_ACTIONS)[number]

export interface GitHubWriteProposalInput {
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
}

export type GitHubWriteProposalDecision = 'PROPOSED' | 'BLOCKED'

export interface GitHubWriteProposalResult {
  readonly decision: GitHubWriteProposalDecision
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
  readonly blockReasons: readonly string[]
}

export function evaluateGitHubWriteProposal(
  input: GitHubWriteProposalInput,
): GitHubWriteProposalResult {
  const blockReasons: string[] = []
  const action = input.action.trim()

  if (action.length === 0) {
    blockReasons.push('GitHub write action must not be empty.')
  } else if (!ALLOWED_GITHUB_WRITE_ACTIONS.includes(action as AllowedGitHubWriteAction)) {
    blockReasons.push(`Action is not allowed: ${action}`)
  }

  if (input.repository.trim().length === 0) {
    blockReasons.push('Target repository must be specified.')
  }

  if (input.targetRef.trim().length === 0) {
    blockReasons.push('Target reference (PR number, issue, or branch) must be specified.')
  }

  if (input.content.trim().length === 0) {
    blockReasons.push('Proposal content must not be empty.')
  }

  if (input.reason.trim().length === 0) {
    blockReasons.push('Proposal must include a reason.')
  }

  return {
    decision: blockReasons.length === 0 ? 'PROPOSED' : 'BLOCKED',
    action,
    repository: input.repository,
    targetRef: input.targetRef,
    content: input.content,
    reason: input.reason,
    blockReasons,
  }
}

export function renderGitHubWriteProposal(result: GitHubWriteProposalResult): string {
  const sections: string[] = [
    'CodeMind GitHub write proposal',
    '',
    `Decision: ${result.decision}`,
    `Action: ${result.action}`,
    `Repository: ${result.repository}`,
    `Target ref: ${result.targetRef}`,
    `Reason: ${result.reason}`,
  ]

  if (result.decision === 'PROPOSED') {
    sections.push('', 'Proposed content:')
    sections.push(result.content)
  }

  if (result.blockReasons.length > 0) {
    sections.push('', 'Block reasons:')
    sections.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  sections.push(
    '',
    'Status: PROPOSAL_ONLY',
    'This is a GitHub write proposal. No GitHub API call has been made. No PR has been created, no comment posted, no label applied.',
  )

  return sections.join('\n')
}
