import { renderAuditEvents } from '../audit/runtime-audit-log.js'
import { createGitHubWriteGateAuditEvent } from '../github-write/github-write-gate-audit.js'
import { FakePrCollaborationClient } from '../github-write/fake-pr-collaboration-client.js'
import {
  executePrCollaboration,
  renderPrCollaborationResult,
  type PrCollaborationAction,
  type PrCollaborationClient,
  type PrCollaborationRequest,
} from '../github-write/pr-collaboration.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface PrCollaborationToolInput {
  readonly action: PrCollaborationAction
  readonly repository: string
  readonly prNumber: number
  readonly content: string
  readonly reason: string
  readonly dryRun: boolean
}

function parseAction(value: unknown): PrCollaborationAction {
  if (value === 'post_comment' || value === 'apply_label') {
    return value
  }

  throw new Error('Unsupported PR collaboration action.')
}

function parsePrCollaborationToolInput(input: unknown): PrCollaborationToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing PR collaboration input.')
  }

  const obj = input as Record<string, unknown>
  const action = parseAction(obj['action'])
  const repository = obj['repository']
  const prNumber = obj['prNumber']
  const content = obj['content']
  const reason = obj['reason']
  const dryRun = obj['dryRun']

  if (typeof repository !== 'string' || repository.trim().length === 0) {
    throw new Error('Missing repository.')
  }
  if (typeof prNumber !== 'number') {
    throw new Error('Missing prNumber.')
  }
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Missing content.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }

  return {
    action,
    repository,
    prNumber,
    content,
    reason,
    dryRun: typeof dryRun === 'boolean' ? dryRun : true,
  }
}

function resolveClient(context: RuntimeToolContext): PrCollaborationClient {
  return context.githubClients?.collaborationClient ?? new FakePrCollaborationClient()
}

export const prCollaborationTool: RuntimeToolDefinition = {
  name: 'pr_collaboration',
  description: 'Apply approved PR collaboration actions through the GitHub API (or fake client when no token).',
  capability: 'GITHUB_PR_COLLABORATION',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parsePrCollaborationToolInput(input)
    const request: PrCollaborationRequest = {
      action: parsed.action,
      repository: parsed.repository,
      prNumber: parsed.prNumber,
      content: parsed.content,
      reason: parsed.reason,
      dryRun: parsed.dryRun,
    }

    const client = resolveClient(context)
    const result = await executePrCollaboration(request, context.policy, context.approval, client)
    const output = renderPrCollaborationResult(result)
    const auditEvent = createGitHubWriteGateAuditEvent(result.gateResult, context.approval)
    const auditOutput = renderAuditEvents([auditEvent])

    return [output, '', '---', '', auditOutput].join('\n')
  },
}
