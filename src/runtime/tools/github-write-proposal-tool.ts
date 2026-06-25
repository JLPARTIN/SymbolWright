import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  evaluateGitHubWriteProposal,
  renderGitHubWriteProposal,
  type GitHubWriteProposalInput,
} from '../github-write/github-write-proposal.js'
import { createGitHubWriteProposalAuditEvent } from '../github-write/github-write-proposal-audit.js'
import { renderAuditEvents } from '../audit/runtime-audit-log.js'

export interface GitHubWriteProposalToolInput {
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
}

function parseGitHubWriteProposalToolInput(input: unknown): GitHubWriteProposalToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing GitHub write proposal input.')
  }

  const obj = input as Record<string, unknown>
  const action = obj['action']
  const repository = obj['repository']
  const targetRef = obj['targetRef']
  const content = obj['content']
  const reason = obj['reason']

  if (typeof action !== 'string' || action.trim().length === 0) {
    throw new Error('Missing action.')
  }
  if (typeof repository !== 'string' || repository.trim().length === 0) {
    throw new Error('Missing repository.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }

  return {
    action,
    repository,
    targetRef: typeof targetRef === 'string' ? targetRef : '',
    content: typeof content === 'string' ? content : '',
    reason,
  }
}

export const githubWriteProposalTool: RuntimeToolDefinition = {
  name: 'github_write_proposal',
  description: 'Create a governed GitHub write proposal without executing any GitHub API call.',
  capability: 'GITHUB_WRITE_PROPOSAL',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parseGitHubWriteProposalToolInput(input)

    const proposalInput: GitHubWriteProposalInput = {
      action: parsed.action,
      repository: parsed.repository,
      targetRef: parsed.targetRef,
      content: parsed.content,
      reason: parsed.reason,
    }

    const result = evaluateGitHubWriteProposal(proposalInput)
    const proposalOutput = renderGitHubWriteProposal(result)
    const auditEvent = createGitHubWriteProposalAuditEvent(result)
    const auditOutput = renderAuditEvents([auditEvent])

    return [proposalOutput, '', '---', '', auditOutput].join('\n')
  },
}
