import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  ALLOWED_GITHUB_WRITE_ACTIONS,
  type AllowedGitHubWriteAction,
} from './github-write-proposal.js'

export interface GitHubWriteGateRequest {
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
  readonly dryRun: boolean
}

export type GitHubWriteGateDecision = 'ALLOWED' | 'BLOCKED'

export interface GitHubWriteGateResult {
  readonly decision: GitHubWriteGateDecision
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
  readonly dryRun: boolean
  readonly blockReasons: readonly string[]
}

export function evaluateGitHubWriteGate(
  request: GitHubWriteGateRequest,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): GitHubWriteGateResult {
  const blockReasons: string[] = []
  const action = request.action.trim()

  if (!policy.allowGitHubWrites) {
    blockReasons.push('GitHub writes are disabled by runtime policy.')
  }

  if (approval === undefined) {
    blockReasons.push('Approval ticket is required for GitHub writes.')
  } else if (!approval.scopes.includes('github:write')) {
    blockReasons.push('Approval ticket is missing required scope: github:write')
  }

  if (action.length === 0) {
    blockReasons.push('GitHub write action must not be empty.')
  } else if (!ALLOWED_GITHUB_WRITE_ACTIONS.includes(action as AllowedGitHubWriteAction)) {
    blockReasons.push(`Action is not allowed: ${action}`)
  }

  if (request.repository.trim().length === 0) {
    blockReasons.push('Target repository must be specified.')
  }

  if (request.targetRef.trim().length === 0) {
    blockReasons.push('Target reference (PR number, issue, or branch) must be specified.')
  }

  if (request.content.trim().length === 0) {
    blockReasons.push('Write content must not be empty.')
  }

  if (request.reason.trim().length === 0) {
    blockReasons.push('GitHub write request must include a reason.')
  }

  return {
    decision: blockReasons.length === 0 ? 'ALLOWED' : 'BLOCKED',
    action,
    repository: request.repository,
    targetRef: request.targetRef,
    content: request.content,
    reason: request.reason,
    dryRun: request.dryRun,
    blockReasons,
  }
}

export function renderGitHubWriteGateResult(result: GitHubWriteGateResult): string {
  const sections: string[] = [
    'CodeMind GitHub write gate',
    '',
    `Decision: ${result.decision}`,
    `Action: ${result.action}`,
    `Repository: ${result.repository}`,
    `Target ref: ${result.targetRef}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
  ]

  if (result.blockReasons.length > 0) {
    sections.push('', 'Block reasons:')
    sections.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.decision === 'ALLOWED' && result.dryRun) {
    sections.push(
      '',
      'Dry-run preview: GitHub write would be allowed.',
      'No GitHub API call has been made.',
    )
  }

  if (result.decision === 'ALLOWED' && !result.dryRun) {
    sections.push(
      '',
      'GitHub write is allowed by policy and approval.',
      'Note: This gate evaluates permission only. No GitHub API call is made by this tool.',
    )
  }

  return sections.join('\n')
}
