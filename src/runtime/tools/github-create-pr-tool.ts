import { renderAuditEvents } from '../audit/runtime-audit-log.js'
import { createGitHubWriteGateAuditEvent } from '../github-write/github-write-gate-audit.js'
import {
  executeGitHubPrCreation,
  renderGitHubPrCreationResult,
  type GitHubPrCreationClient,
  type GitHubPrCreationFile,
  type GitHubPrCreationRequest,
} from '../github-write/github-pr-creation.js'
import { FakeGitHubPrCreationClient } from '../github-write/fake-github-pr-creation-client.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface GitHubCreatePrToolInput {
  readonly repository: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly title: string
  readonly body: string
  readonly reason: string
  readonly dryRun: boolean
  readonly files: readonly GitHubPrCreationFile[]
}

function parseFile(input: unknown, index: number): GitHubPrCreationFile {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`PR file ${index + 1} must be an object.`)
  }

  const obj = input as Record<string, unknown>
  const path = obj['path']
  const content = obj['content']

  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new Error(`PR file ${index + 1} must include path.`)
  }
  if (typeof content !== 'string') {
    throw new Error(`PR file ${index + 1} must include string content.`)
  }

  return { path, content }
}

function parseGitHubCreatePrToolInput(input: unknown): GitHubCreatePrToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing GitHub create PR input.')
  }

  const obj = input as Record<string, unknown>
  const repository = obj['repository']
  const baseBranch = obj['baseBranch']
  const headBranch = obj['headBranch']
  const title = obj['title']
  const body = obj['body']
  const reason = obj['reason']
  const dryRun = obj['dryRun']
  const files = obj['files']

  if (typeof repository !== 'string' || repository.trim().length === 0) {
    throw new Error('Missing repository.')
  }
  if (typeof baseBranch !== 'string' || baseBranch.trim().length === 0) {
    throw new Error('Missing baseBranch.')
  }
  if (typeof headBranch !== 'string' || headBranch.trim().length === 0) {
    throw new Error('Missing headBranch.')
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Missing title.')
  }
  if (typeof body !== 'string') {
    throw new Error('Missing body.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Missing files.')
  }

  return {
    repository,
    baseBranch,
    headBranch,
    title,
    body,
    reason,
    dryRun: typeof dryRun === 'boolean' ? dryRun : true,
    files: files.map((file, index) => parseFile(file, index)),
  }
}

function resolveClient(context: RuntimeToolContext): GitHubPrCreationClient {
  return context.githubClients?.prCreationClient ?? new FakeGitHubPrCreationClient()
}

export const githubCreatePrTool: RuntimeToolDefinition = {
  name: 'github_create_pr',
  description: 'Create an approved draft PR through the GitHub API (or fake client when no token).',
  capability: 'GITHUB_PR_CREATION',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseGitHubCreatePrToolInput(input)
    const request: GitHubPrCreationRequest = {
      repository: parsed.repository,
      baseBranch: parsed.baseBranch,
      headBranch: parsed.headBranch,
      title: parsed.title,
      body: parsed.body,
      reason: parsed.reason,
      dryRun: parsed.dryRun,
      files: parsed.files,
    }

    const client = resolveClient(context)
    const result = await executeGitHubPrCreation(request, context.policy, context.approval, client)
    const output = renderGitHubPrCreationResult(result)
    const auditEvent = createGitHubWriteGateAuditEvent(result.gateResult, context.approval)
    const auditOutput = renderAuditEvents([auditEvent])

    return [output, '', '---', '', auditOutput].join('\n')
  },
}
