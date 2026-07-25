import type { IncomingMessage, ServerResponse } from 'node:http'

import type { MissionService } from '../../mission/mission-service.js'
import { MissionNotFoundError } from '../../mission/mission-service.js'
import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { performExternalRepositoryIntake } from '../../github/external-repository-intake.js'
import {
  GitHubOperationsAdapter,
  type GitHubOperationOutcome,
} from '../../github/github-operations-adapter.js'
import {
  createGitHubOperationsPolicy,
  GITHUB_OPERATIONS,
  type GitHubOperation,
} from '../../github/github-operations-policy.js'
import type { PrOperationChangedFile, PrOperationPacket } from '../../github/pr-operation-packet.js'
import { preparePrOperationPacket } from '../../github/pr-operation-packet.js'
import { DefaultGitHubHttpClient } from '../../runtime/live-read/github-http-client.js'

const MAX_INTAKE_REQUEST_BYTES = 64 * 1024

export interface GitHubIntakeRouteContext {
  readonly service: MissionService
  readonly cwd: string
  readonly githubToken?: string
  /** Preferred over `githubToken` when present — see `RepositoryRouteContext.githubTokenResolver`. */
  readonly githubTokenResolver?: (repository?: string) => Promise<string | undefined>
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    totalBytes += buffer.length
    if (totalBytes > MAX_INTAKE_REQUEST_BYTES) {
      throw new Error(`Request body exceeds ${MAX_INTAKE_REQUEST_BYTES} bytes`)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object.')
  }
  return value as Record<string, unknown>
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`"${field}" must be a non-empty string.`)
  }
  return value
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`"${field}" must be a string.`)
  return value
}

function parseEnabledOperations(record: Record<string, unknown>): readonly GitHubOperation[] {
  const value = record['enabledOperations']
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('"enabledOperations" must be an array of strings.')
  return value.map((entry) => {
    if (typeof entry !== 'string' || !(GITHUB_OPERATIONS as readonly string[]).includes(entry)) {
      throw new Error(`"enabledOperations" contains an unknown operation: ${String(entry)}`)
    }
    return entry as GitHubOperation
  })
}

function changeTypeForStatusCode(code: string): PrOperationChangedFile['changeType'] {
  if (code.includes('D')) return 'deleted'
  if (code.includes('R')) return 'renamed'
  if (code.includes('A') || code.includes('?')) return 'added'
  return 'modified'
}

function parseChangedFiles(statusOutput: string): readonly PrOperationChangedFile[] {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => ({
      path: line.slice(3).trim(),
      changeType: changeTypeForStatusCode(line.slice(0, 2)),
    }))
    .filter(
      (entry) =>
        entry.path.length > 0 &&
        !entry.path.startsWith('.symbolwright/') &&
        !entry.path.startsWith('.symbolwright/'),
    )
}

/**
 * `POST /api/github/intake` — parses a GitHub repository target, acquires
 * it into a controlled workspace, runs Bundle #7 portability discovery,
 * and (unless mode is `dry-run` or acquisition failed) creates a real
 * mission rooted at the acquired workspace.
 *
 * `POST /api/missions/:id/github-pr-packet` — builds the non-destructive
 * PR-preparation packet (local branch, staged/committed changes, generated
 * title/body) for a mission created via intake.
 *
 * `POST /api/missions/:id/github-pr-packet/publish` — attempts the real
 * remote push + PR creation, gated by an explicit per-call
 * `enabledOperations` list. Blocked/unavailable outcomes are returned as
 * ordinary 200 responses with `status`, never as a fabricated success.
 */
export async function handleGitHubIntakeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: GitHubIntakeRouteContext,
): Promise<boolean> {
  if (url.pathname === '/api/github/intake') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' })
      return true
    }
    try {
      const record = asRecord(await readJsonBody(req))
      const mode = requiredString(record, 'mode')
      if (mode !== 'dry-run' && mode !== 'read-only' && mode !== 'writable') {
        throw new Error('"mode" must be one of: dry-run, read-only, writable.')
      }
      const policy = createGitHubOperationsPolicy({
        enabledOperations: parseEnabledOperations(record),
      })
      const result = await performExternalRepositoryIntake({
        rawTarget: requiredString(record, 'target'),
        workspaceRoot: context.cwd,
        missionService: context.service,
        mode,
        objective: requiredString(record, 'objective'),
        runtimeMode: 'READ_ONLY',
        policy,
        ...(optionalString(record, 'ref') === undefined
          ? {}
          : { ref: optionalString(record, 'ref')! }),
        ...(optionalString(record, 'name') === undefined
          ? {}
          : { name: optionalString(record, 'name')! }),
      })
      sendJson(res, 200, {
        target: result.target,
        acquisition: result.acquisition,
        profile: result.profile,
        ...(result.mission === undefined ? {} : { mission: result.mission }),
      })
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  const packetMatch = /^\/api\/missions\/([^/]+)\/github-pr-packet(\/publish)?$/.exec(url.pathname)
  if (packetMatch === null) return false
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return true
  }
  const missionId = packetMatch[1]!
  const isPublish = packetMatch[2] !== undefined

  try {
    const mission = context.service.get(missionId)
    const record = asRecord(await readJsonBody(req))
    const policy = createGitHubOperationsPolicy({
      enabledOperations: parseEnabledOperations(record),
    })

    if (!isPublish) {
      const status = await runGitCommand(['status', '--porcelain=v1'], mission.repository.rootPath)
      const changedFiles = parseChangedFiles(status.stdout)
      const branchName = `symbolwright/${mission.id}`
      const packet = await preparePrOperationPacket({
        repositoryRoot: mission.repository.rootPath,
        branchName,
        baseBranch: mission.repository.branch ?? 'main',
        objective: mission.objective,
        changedFiles,
        validationEvidence: [],
        policy,
      })
      context.service.appendEvent(
        missionId,
        'github.pr-packet.prepared',
        `Prepared PR operation packet on branch "${branchName}".`,
        {
          branchName,
          branchCreated: packet.branchCreated,
          commitCreated: packet.commitCreated,
          readyToPush: packet.readyToPush,
        },
      )
      sendJson(res, 200, { packet })
      return true
    }

    const packet = record['packet'] as PrOperationPacket | undefined
    if (packet === undefined) {
      throw new Error(
        '"packet" (a previously generated PR operation packet) is required to publish.',
      )
    }
    const remoteUrl = mission.repository.remoteUrl
    if (remoteUrl === undefined) {
      throw new Error('Mission has no recorded remote URL to publish to.')
    }
    const repository = remoteRepositorySlug(remoteUrl)
    const resolvedToken =
      context.githubTokenResolver !== undefined
        ? await context.githubTokenResolver(repository)
        : context.githubToken
    const adapter = new GitHubOperationsAdapter({
      policy,
      ...(resolvedToken === undefined
        ? {}
        : { httpClient: new DefaultGitHubHttpClient({ token: resolvedToken }) }),
    })
    const branchResult = await adapter.createBranch({
      repository,
      baseBranch: packet.baseBranch,
      headBranch: packet.branchName,
    })
    let prResult: GitHubOperationOutcome<{ readonly url: string }> | undefined
    if (branchResult.status === 'ok') {
      prResult = await adapter.openPullRequest({
        repository,
        baseBranch: packet.baseBranch,
        headBranch: packet.branchName,
        title: packet.prTitle,
        body: packet.prBody,
        draft: true,
      })
    }
    context.service.appendEvent(
      missionId,
      'github.pr-packet.publish-attempted',
      `Publish attempt for branch "${packet.branchName}": ${branchResult.status}.`,
      { branchResult, prResult },
    )
    sendJson(res, 200, { branchResult, prResult })
    return true
  } catch (error) {
    if (error instanceof MissionNotFoundError) {
      sendJson(res, 404, { error: error.message })
      return true
    }
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return true
  }
}

function remoteRepositorySlug(remoteUrl: string): string {
  const trimmed = remoteUrl.trim().replace(/\.git$/, '')
  const ssh = /^git@[^:]+:([^/]+\/.+)$/.exec(trimmed)
  if (ssh !== null) return ssh[1]!
  const url = new URL(trimmed)
  return url.pathname.replace(/^\//, '')
}
