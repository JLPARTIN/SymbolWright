import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { evaluateGitHubWriteGate, type GitHubWriteGateResult } from './github-write-gate.js'

export type GitHubWriteExecutorOutcome = 'BLOCKED' | 'DRY_RUN' | 'EXECUTED'

export type GitHubWriteExecutionMode = 'fixture' | 'live'

export type GitHubWriteExecutorAction = 'create_draft_pr' | 'post_comment' | 'apply_label'

export const GITHUB_WRITE_EXECUTOR_ACTIONS: readonly GitHubWriteExecutorAction[] = [
  'create_draft_pr',
  'post_comment',
  'apply_label',
] as const

export interface GitHubWriteExecutorRequest {
  readonly action: GitHubWriteExecutorAction
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
  readonly dryRun: boolean
}

export interface GitHubWriteExecutorClient {
  readonly execute: (input: {
    readonly action: GitHubWriteExecutorAction
    readonly repository: string
    readonly targetRef: string
    readonly content: string
  }) => Promise<GitHubWriteExecutorClientResult>
}

export interface GitHubWriteExecutorClientResult {
  readonly operationSummary: string
  readonly resourceUrl: string | null
}

export interface GitHubWriteExecutorResult {
  readonly outcome: GitHubWriteExecutorOutcome
  readonly executionMode: GitHubWriteExecutionMode
  readonly gateResult: GitHubWriteGateResult
  readonly action: GitHubWriteExecutorAction
  readonly repository: string
  readonly targetRef: string
  readonly operationSummary: string | null
  readonly resourceUrl: string | null
  readonly elapsedMs: number
  readonly blockReasons: readonly string[]
  readonly recommendedNextAction: string
}

function getRecommendedNextAction(outcome: GitHubWriteExecutorOutcome): string {
  switch (outcome) {
    case 'BLOCKED':
      return 'Review block reasons and ensure policy allows GitHub writes with a valid approval ticket.'
    case 'DRY_RUN':
      return 'Review the dry-run output. To execute, set dryRun to false with a valid approval ticket.'
    case 'EXECUTED':
      return 'Verify the GitHub write was applied correctly. Check the resource URL if provided.'
  }
}

function validateRequest(request: GitHubWriteExecutorRequest): readonly string[] {
  const reasons: string[] = []

  if (!GITHUB_WRITE_EXECUTOR_ACTIONS.includes(request.action)) {
    reasons.push(`Action is not supported: ${request.action}`)
  }

  if (request.repository.trim().length === 0) {
    reasons.push('Repository must be specified.')
  }

  if (request.targetRef.trim().length === 0) {
    reasons.push('Target reference must be specified.')
  }

  if (request.content.trim().length === 0) {
    reasons.push('Content must not be empty.')
  }

  if (request.reason.trim().length === 0) {
    reasons.push('Reason must be specified.')
  }

  return reasons
}

export async function executeGitHubWrite(
  request: GitHubWriteExecutorRequest,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
  client: GitHubWriteExecutorClient,
  executionMode: GitHubWriteExecutionMode = 'fixture',
): Promise<GitHubWriteExecutorResult> {
  const start = Date.now()

  const gateResult = evaluateGitHubWriteGate(
    {
      action: request.action,
      repository: request.repository,
      targetRef: request.targetRef,
      content: request.content,
      reason: request.reason,
      dryRun: request.dryRun,
    },
    policy,
    approval,
  )

  const validationReasons = validateRequest(request)
  const allBlockReasons = [...gateResult.blockReasons, ...validationReasons]

  if (!request.dryRun && executionMode === 'fixture') {
    allBlockReasons.push(
      'Non-dry-run execution is blocked in fixture mode. Provide a GITHUB_TOKEN for live execution.',
    )
  }

  if (gateResult.decision === 'BLOCKED' || allBlockReasons.length > 0) {
    return {
      outcome: 'BLOCKED',
      executionMode,
      gateResult,
      action: request.action,
      repository: request.repository,
      targetRef: request.targetRef,
      operationSummary: null,
      resourceUrl: null,
      elapsedMs: Date.now() - start,
      blockReasons: allBlockReasons,
      recommendedNextAction: getRecommendedNextAction('BLOCKED'),
    }
  }

  if (request.dryRun) {
    return {
      outcome: 'DRY_RUN',
      executionMode,
      gateResult,
      action: request.action,
      repository: request.repository,
      targetRef: request.targetRef,
      operationSummary: describeDryRunOperation(request),
      resourceUrl: null,
      elapsedMs: Date.now() - start,
      blockReasons: [],
      recommendedNextAction: getRecommendedNextAction('DRY_RUN'),
    }
  }

  const clientResult = await client.execute({
    action: request.action,
    repository: request.repository,
    targetRef: request.targetRef,
    content: request.content,
  })

  return {
    outcome: 'EXECUTED',
    executionMode,
    gateResult,
    action: request.action,
    repository: request.repository,
    targetRef: request.targetRef,
    operationSummary: clientResult.operationSummary,
    resourceUrl: clientResult.resourceUrl,
    elapsedMs: Date.now() - start,
    blockReasons: [],
    recommendedNextAction: getRecommendedNextAction('EXECUTED'),
  }
}

function describeDryRunOperation(request: GitHubWriteExecutorRequest): string {
  switch (request.action) {
    case 'create_draft_pr':
      return `Would create draft PR on ${request.repository} targeting ${request.targetRef}`
    case 'post_comment':
      return `Would post comment on ${request.repository} PR #${request.targetRef}`
    case 'apply_label':
      return `Would apply label "${request.content}" on ${request.repository} PR #${request.targetRef}`
  }
}

export function renderGitHubWriteExecutorResult(result: GitHubWriteExecutorResult): string {
  const lines = [
    'SymbolWright GitHub Write Executor',
    '',
    `Outcome: ${result.outcome}`,
    `Execution mode: ${result.executionMode}`,
    `Action: ${result.action}`,
    `Repository: ${result.repository}`,
    `Target ref: ${result.targetRef}`,
    `Elapsed: ${result.elapsedMs}ms`,
  ]

  if (result.operationSummary !== null) {
    lines.push(`Operation: ${result.operationSummary}`)
  }

  if (result.resourceUrl !== null) {
    lines.push(`Resource: ${result.resourceUrl}`)
  }

  if (result.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    for (const reason of result.blockReasons) {
      lines.push(`- ${reason}`)
    }
  }

  lines.push('', `Recommended next action: ${result.recommendedNextAction}`)

  if (result.outcome === 'DRY_RUN') {
    lines.push('', 'Dry-run only. No GitHub API call has been made.')
  }

  return lines.join('\n')
}
