import fs from 'node:fs'

import {
  executeGitHubWrite,
  renderGitHubWriteExecutorResult,
  type GitHubWriteExecutorAction,
  type GitHubWriteExecutorClient,
  type GitHubWriteExecutorRequest,
} from './runtime/github-write/github-write-executor.js'
import { FakeGitHubWriteExecutorClient } from './runtime/github-write/fake-github-write-executor-client.js'
import { DefaultGitHubWriteExecutorClient } from './runtime/github-write/default-github-write-executor-client.js'
import { DefaultGitHubHttpClient } from './runtime/live-read/github-http-client.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from './runtime/types.js'

interface GitHubWriteExecutorFixtureRequest {
  readonly action: GitHubWriteExecutorAction
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
  readonly dryRun?: boolean
  readonly policy?: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
}

export async function renderGitHubWriteExecutorCommand(fixturePath: string): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as GitHubWriteExecutorFixtureRequest

  if (typeof raw.action !== 'string' || raw.action.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "action" field.')
  }

  if (typeof raw.repository !== 'string' || raw.repository.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "repository" field.')
  }

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  const request: GitHubWriteExecutorRequest = {
    action: raw.action,
    repository: raw.repository,
    targetRef: raw.targetRef,
    content: raw.content,
    reason: raw.reason,
    dryRun: raw.dryRun ?? true,
  }

  const policy: RuntimePolicySnapshot = raw.policy ?? {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: true,
    protectedPaths: [],
    noisyDirs: [],
  }

  const approval: RuntimeApproval | undefined = raw.approval

  const githubToken = process.env['GITHUB_TOKEN']
  const client: GitHubWriteExecutorClient = githubToken !== undefined && githubToken.length > 0
    ? new DefaultGitHubWriteExecutorClient(new DefaultGitHubHttpClient({ token: githubToken }))
    : new FakeGitHubWriteExecutorClient()
  const result = await executeGitHubWrite(request, policy, approval, client)
  return renderGitHubWriteExecutorResult(result)
}
