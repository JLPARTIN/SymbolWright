import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { evaluateGitHubWriteGate, type GitHubWriteGateResult } from './github-write-gate.js'

export type GitHubPrCreationOutcome = 'BLOCKED' | 'DRY_RUN' | 'CREATED'

export interface GitHubPrCreationFile {
  readonly path: string
  readonly content: string
}

export interface GitHubPrCreationRequest {
  readonly repository: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly title: string
  readonly body: string
  readonly files: readonly GitHubPrCreationFile[]
  readonly reason: string
  readonly dryRun: boolean
}

export interface GitHubPrCreationClient {
  readonly createBranch: (input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
  }) => Promise<void>
  readonly commitFiles: (input: {
    readonly repository: string
    readonly branch: string
    readonly files: readonly GitHubPrCreationFile[]
    readonly message: string
  }) => Promise<void>
  readonly createPullRequest: (input: {
    readonly repository: string
    readonly baseBranch: string
    readonly headBranch: string
    readonly title: string
    readonly body: string
    readonly draft: boolean
  }) => Promise<{ readonly url: string }>
}

export interface GitHubPrCreationResult {
  readonly outcome: GitHubPrCreationOutcome
  readonly gateResult: GitHubWriteGateResult
  readonly pullRequestUrl: string | null
  readonly operations: readonly string[]
  readonly blockReasons: readonly string[]
}

function getPrCreationBlockReasons(request: GitHubPrCreationRequest): readonly string[] {
  const blockReasons: string[] = []

  if (request.baseBranch.trim().length === 0) {
    blockReasons.push('Base branch must be specified.')
  }
  if (request.headBranch.trim().length === 0) {
    blockReasons.push('Head branch must be specified.')
  }
  if (request.headBranch === request.baseBranch) {
    blockReasons.push('Head branch must be different from base branch.')
  }
  if (request.headBranch === 'main') {
    blockReasons.push('Head branch must not be main.')
  }
  if (request.title.trim().length === 0) {
    blockReasons.push('Pull request title must be specified.')
  }
  if (request.files.length === 0) {
    blockReasons.push('At least one file must be included for PR creation.')
  }

  return blockReasons
}

export async function executeGitHubPrCreation(
  request: GitHubPrCreationRequest,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
  client: GitHubPrCreationClient,
): Promise<GitHubPrCreationResult> {
  const gateResult = evaluateGitHubWriteGate(
    {
      action: 'create_draft_pr',
      repository: request.repository,
      targetRef: request.headBranch,
      content: `${request.title}\n\n${request.body}`,
      reason: request.reason,
      dryRun: request.dryRun,
    },
    policy,
    approval,
  )

  const blockReasons = [...gateResult.blockReasons, ...getPrCreationBlockReasons(request)]

  if (gateResult.decision === 'BLOCKED' || blockReasons.length > 0) {
    return {
      outcome: 'BLOCKED',
      gateResult,
      pullRequestUrl: null,
      operations: [],
      blockReasons,
    }
  }

  const operations = [
    `create branch ${request.headBranch} from ${request.baseBranch}`,
    `commit ${request.files.length} file(s) to ${request.headBranch}`,
    `create draft pull request into ${request.baseBranch}`,
  ]

  if (request.dryRun) {
    return {
      outcome: 'DRY_RUN',
      gateResult,
      pullRequestUrl: null,
      operations,
      blockReasons: [],
    }
  }

  await client.createBranch({
    repository: request.repository,
    baseBranch: request.baseBranch,
    headBranch: request.headBranch,
  })
  await client.commitFiles({
    repository: request.repository,
    branch: request.headBranch,
    files: request.files,
    message: request.title,
  })
  const pullRequest = await client.createPullRequest({
    repository: request.repository,
    baseBranch: request.baseBranch,
    headBranch: request.headBranch,
    title: request.title,
    body: request.body,
    draft: true,
  })

  return {
    outcome: 'CREATED',
    gateResult,
    pullRequestUrl: pullRequest.url,
    operations,
    blockReasons: [],
  }
}

export function renderGitHubPrCreationResult(result: GitHubPrCreationResult): string {
  const lines = [
    'SymbolWright GitHub PR creation',
    '',
    `Outcome: ${result.outcome}`,
    `Decision: ${result.gateResult.decision}`,
    `Repository: ${result.gateResult.repository}`,
    `Head branch: ${result.gateResult.targetRef}`,
  ]

  if (result.operations.length > 0) {
    lines.push('', 'Operations:')
    lines.push(...result.operations.map((operation) => `- ${operation}`))
  }

  if (result.blockReasons.length > 0) {
    lines.push('', 'Block reasons:')
    lines.push(...result.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.pullRequestUrl !== null) {
    lines.push('', `Pull request: ${result.pullRequestUrl}`)
  }

  if (result.outcome === 'DRY_RUN') {
    lines.push('', 'Dry-run only. No GitHub API call has been made.')
  }

  return lines.join('\n')
}
