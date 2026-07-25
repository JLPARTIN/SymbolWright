import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { evaluateGitHubWriteGate, type GitHubWriteGateResult } from './github-write-gate.js'

export type PrCollaborationOutcome = 'BLOCKED' | 'DRY_RUN' | 'APPLIED'
export type PrCollaborationAction = 'post_comment' | 'apply_label'

export interface PrCollaborationRequest {
  readonly action: PrCollaborationAction
  readonly repository: string
  readonly prNumber: number
  readonly content: string
  readonly reason: string
  readonly dryRun: boolean
}

export interface PrCollaborationClient {
  readonly addComment: (input: {
    readonly repository: string
    readonly prNumber: number
    readonly body: string
  }) => Promise<void>
  readonly addLabel: (input: {
    readonly repository: string
    readonly prNumber: number
    readonly label: string
  }) => Promise<void>
}

export interface PrCollaborationResult {
  readonly outcome: PrCollaborationOutcome
  readonly gateResult: GitHubWriteGateResult
  readonly operation: string | null
  readonly blockReasons: readonly string[]
}

function validateRequest(request: PrCollaborationRequest): readonly string[] {
  const blockReasons: string[] = []

  if (!Number.isInteger(request.prNumber) || request.prNumber <= 0) {
    blockReasons.push('Pull request number must be a positive integer.')
  }

  return blockReasons
}

export async function executePrCollaboration(
  request: PrCollaborationRequest,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
  client: PrCollaborationClient,
): Promise<PrCollaborationResult> {
  const gateResult = evaluateGitHubWriteGate(
    {
      action: request.action,
      repository: request.repository,
      targetRef: String(request.prNumber),
      content: request.content,
      reason: request.reason,
      dryRun: request.dryRun,
    },
    policy,
    approval,
  )

  const blockReasons = [...gateResult.blockReasons, ...validateRequest(request)]

  if (gateResult.decision === 'BLOCKED' || blockReasons.length > 0) {
    return {
      outcome: 'BLOCKED',
      gateResult,
      operation: null,
      blockReasons,
    }
  }

  const operation =
    request.action === 'post_comment'
      ? `add conversation note to PR #${request.prNumber}`
      : `apply label to PR #${request.prNumber}`

  if (request.dryRun) {
    return {
      outcome: 'DRY_RUN',
      gateResult,
      operation,
      blockReasons: [],
    }
  }

  if (request.action === 'post_comment') {
    await client.addComment({
      repository: request.repository,
      prNumber: request.prNumber,
      body: request.content,
    })
  } else {
    await client.addLabel({
      repository: request.repository,
      prNumber: request.prNumber,
      label: request.content,
    })
  }

  return {
    outcome: 'APPLIED',
    gateResult,
    operation,
    blockReasons: [],
  }
}

export function renderPrCollaborationResult(result: PrCollaborationResult): string {
  const lines = [
    'SymbolWright PR collaboration',
    '',
    `Outcome: ${result.outcome}`,
    `Decision: ${result.gateResult.decision}`,
    `Action: ${result.gateResult.action}`,
    `Repository: ${result.gateResult.repository}`,
    `Target PR: ${result.gateResult.targetRef}`,
  ]

  if (result.operation !== null) {
    lines.push('', `Operation: ${result.operation}`)
  }

  if (result.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    lines.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.outcome === 'DRY_RUN') {
    lines.push('', 'Dry-run only. No live GitHub API call has been made.')
  }

  return lines.join('\n')
}
