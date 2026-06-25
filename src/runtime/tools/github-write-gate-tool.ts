import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  evaluateGitHubWriteGate,
  renderGitHubWriteGateResult,
  type GitHubWriteGateRequest,
} from '../github-write/github-write-gate.js'
import { createGitHubWriteGateAuditEvent } from '../github-write/github-write-gate-audit.js'
import { renderAuditEvents } from '../audit/runtime-audit-log.js'

export interface GitHubWriteGateToolInput {
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
  readonly dryRun: boolean
}

function parseGitHubWriteGateToolInput(input: unknown): GitHubWriteGateToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing GitHub write gate input.')
  }

  const obj = input as Record<string, unknown>
  const action = obj['action']
  const repository = obj['repository']
  const reason = obj['reason']
  const dryRun = obj['dryRun']
  const targetRef = obj['targetRef']
  const content = obj['content']

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
    dryRun: typeof dryRun === 'boolean' ? dryRun : true,
  }
}

export const githubWriteGateTool: RuntimeToolDefinition = {
  name: 'github_write_gate',
  description: 'Evaluate an approved GitHub write action through the policy-gated write gate.',
  capability: 'GITHUB_WRITE_GATE',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseGitHubWriteGateToolInput(input)

    const request: GitHubWriteGateRequest = {
      action: parsed.action,
      repository: parsed.repository,
      targetRef: parsed.targetRef,
      content: parsed.content,
      reason: parsed.reason,
      dryRun: parsed.dryRun,
    }

    const result = evaluateGitHubWriteGate(request, context.policy, context.approval)
    const gateOutput = renderGitHubWriteGateResult(result)
    const auditEvent = createGitHubWriteGateAuditEvent(result, context.approval)
    const auditOutput = renderAuditEvents([auditEvent])

    return [gateOutput, '', '---', '', auditOutput].join('\n')
  },
}
