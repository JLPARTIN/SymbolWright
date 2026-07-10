import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  checkpointBeforeWrite,
  snapshotFileBeforeWrite,
} from '../../checkpoint/checkpoint-tool-hook.js'
import { getCheckpoint, restoreCheckpoint } from '../../checkpoint/checkpoint-service.js'
import { sha256Hex } from '../../checkpoint/checkpoint-hash.js'
import { DefaultGitHubHttpClient } from '../../runtime/live-read/github-http-client.js'
import { DefaultGitHubPrCreationClient } from '../../runtime/github-write/default-github-pr-creation-client.js'
import {
  executeGitHubPrCreation,
  type GitHubPrCreationClient,
  type GitHubPrCreationFile,
} from '../../runtime/github-write/github-pr-creation.js'
import { BLOCKED_REFS, evaluateGitToolRequest } from '../../runtime/tools/git-tool.js'
import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { parseGitPorcelainStatus, summarizeGitStatus } from '../../runtime/git/git-status-parser.js'
import { assertReadablePath, resolveWorkspacePath } from '../../runtime/policy/runtime-policy.js'
import type {
  RuntimeApproval,
  RuntimePolicySnapshot,
  RuntimeToolContext,
} from '../../runtime/types.js'

export interface RepositoryRouteContext {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
  readonly githubToken?: string
  /** Test seam: inject a fake GitHubPrCreationClient instead of constructing the real REST client from githubToken. */
  readonly githubPrCreationClient?: GitHubPrCreationClient
}

const MAX_REPOSITORY_REQUEST_BYTES = 4 * 1024 * 1024

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of req) {
    const buf = chunk as Buffer
    totalBytes += buf.length
    if (totalBytes > MAX_REPOSITORY_REQUEST_BYTES) {
      throw new Error(`Request body exceeds ${MAX_REPOSITORY_REQUEST_BYTES} bytes`)
    }
    chunks.push(buf)
  }

  if (chunks.length === 0) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

function toToolContext(context: RepositoryRouteContext, sessionId: unknown): RuntimeToolContext {
  return {
    cwd: context.cwd,
    policy: context.policy,
    ...(typeof sessionId === 'string' && sessionId.trim().length > 0 ? { sessionId } : {}),
  }
}

/** `(res, statusCode, body)` -- deliberately not `request-helpers.ts`'s `sendJson(res, value, statusCode)`; kept local so every call site here reads status-then-body, matching the readonly-registry-routes.ts convention. */
function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export interface RepositoryTreeEntry {
  readonly name: string
  readonly path: string
  readonly type: 'file' | 'directory'
}

function resolveAndCheckReadable(context: RepositoryRouteContext, requestedPath: string): string {
  const resolved = resolveWorkspacePath(context.cwd, requestedPath)
  assertReadablePath(context.policy, context.cwd, resolved)
  return resolved
}

/** `GET /api/repository/tree?dir=` — one directory level at a time, so the client can expand/collapse a real tree instead of fetching a full recursive flatten. */
export function handleRepositoryTree(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requestedDir = url.searchParams.get('dir')?.trim() || '.'

  try {
    const resolvedDir = resolveAndCheckReadable(context, requestedDir)
    const stat = fs.statSync(resolvedDir)
    if (!stat.isDirectory()) {
      sendJson(res, 400, { error: `Not a directory: ${requestedDir}` })
      return
    }

    const dirents = fs.readdirSync(resolvedDir, { withFileTypes: true })
    const entries: RepositoryTreeEntry[] = dirents
      .filter((entry) => !context.policy.noisyDirs.includes(entry.name))
      .map((entry) => {
        const entryPath = path.relative(context.cwd, path.join(resolvedDir, entry.name))
        return {
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    sendJson(res, 200, { dir: requestedDir === '.' ? '' : requestedDir, entries })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** `GET /api/repository/file?path=` — real file content plus a hash the client echoes back on save for optimistic-concurrency conflict detection. */
export function handleRepositoryFileRead(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requestedPath = url.searchParams.get('path')?.trim() ?? ''

  if (requestedPath.length === 0) {
    sendJson(res, 400, { error: 'path is required' })
    return
  }

  try {
    const resolved = resolveAndCheckReadable(context, requestedPath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      sendJson(res, 404, { error: `File not found: ${requestedPath}` })
      return
    }

    const content = fs.readFileSync(resolved, 'utf-8')
    sendJson(res, 200, { path: requestedPath, content, contentHash: sha256Hex(content) })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** `GET /api/repository/status` — structured git status plus the current branch name. */
export async function handleRepositoryStatus(
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  const [statusResult, branchResult] = await Promise.all([
    runGitCommand(['status', '--porcelain=v1'], context.cwd),
    runGitCommand(['branch', '--show-current'], context.cwd),
  ])

  if (statusResult.exitCode !== 0) {
    sendJson(res, 500, { error: statusResult.stderr || 'git status failed' })
    return
  }

  const entries = parseGitPorcelainStatus(statusResult.stdout)
  const summary = summarizeGitStatus(entries)

  sendJson(res, 200, {
    entries,
    summary,
    currentBranch: branchResult.stdout.trim(),
  })
}

/** `GET /api/repository/diff?path=&staged=true|false` — raw unified diff text for one file, or the whole tree when `path` is omitted. */
export async function handleRepositoryDiff(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requestedPath = url.searchParams.get('path')?.trim()
  const staged = url.searchParams.get('staged') === 'true'

  if (requestedPath !== undefined && requestedPath.length > 0) {
    try {
      resolveAndCheckReadable(context, requestedPath)
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      return
    }
  }

  const args = ['diff', ...(staged ? ['--staged'] : [])]
  if (requestedPath !== undefined && requestedPath.length > 0) {
    args.push('--', requestedPath)
  }

  const result = await runGitCommand(args, context.cwd)
  if (result.exitCode !== 0) {
    sendJson(res, 500, { error: result.stderr || 'git diff failed' })
    return
  }

  sendJson(res, 200, { path: requestedPath ?? null, staged, diff: result.stdout })
}

/** `GET /api/repository/branches` — local branches plus which one is current. */
export async function handleRepositoryBranches(
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  const result = await runGitCommand(['branch', '--list'], context.cwd)
  if (result.exitCode !== 0) {
    sendJson(res, 500, { error: result.stderr || 'git branch failed' })
    return
  }

  const branches: string[] = []
  let current = ''

  for (const rawLine of result.stdout.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    if (line.startsWith('* ')) {
      current = line.slice(2).trim()
      branches.push(current)
    } else {
      branches.push(line)
    }
  }

  sendJson(res, 200, { branches, current })
}

/**
 * `PUT /api/repository/file` -- writes a real file through the same
 * checkpoint-bound path `edit_file` uses (resolve + protected-path guard,
 * snapshot before-content, write, then checkpointBeforeWrite), not the
 * Docker-sandboxed `local_file_write` tool path -- that sandbox exists to
 * isolate LLM-agent-directed writes, and spawning a container per
 * interactive browser save would be slow and require Docker as a hard
 * dependency neither is warranted for an authenticated human operator
 * clicking Save in their own Repository tab.
 *
 * Optimistic-concurrency conflict detection: the client echoes back the
 * `contentHash` it got from `GET /api/repository/file` as `baseContentHash`;
 * if the file changed on disk since then, this returns 409 with the
 * current content instead of silently overwriting an external change.
 */
export async function handleRepositoryFileWrite(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  if (!context.policy.allowWrites) {
    sendJson(res, 403, { error: 'Write actions are disabled by runtime policy.' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const targetPath = record['path']
  const content = record['content']
  const baseContentHash = record['baseContentHash']
  const sessionId = record['sessionId']

  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    sendJson(res, 400, { error: 'path is required' })
    return
  }
  if (typeof content !== 'string') {
    sendJson(res, 400, { error: 'content must be a string' })
    return
  }

  try {
    const resolved = resolveAndCheckReadable(context, targetPath)

    const existedBefore = fs.existsSync(resolved)
    if (existedBefore && fs.statSync(resolved).isDirectory()) {
      sendJson(res, 400, { error: `Path is a directory, not a file: ${targetPath}` })
      return
    }

    const currentContent = existedBefore ? fs.readFileSync(resolved, 'utf-8') : null
    const currentHash = currentContent !== null ? sha256Hex(currentContent) : null

    if (typeof baseContentHash === 'string' && baseContentHash !== (currentHash ?? '')) {
      sendJson(res, 409, {
        error: 'The file changed on disk since it was loaded. Reload before saving.',
        path: targetPath,
        currentContent,
        currentContentHash: currentHash,
      })
      return
    }

    const snapshot = snapshotFileBeforeWrite(resolved, targetPath)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, content, 'utf-8')

    checkpointBeforeWrite(
      toToolContext(context, sessionId),
      'local_file_write',
      [snapshot],
      'Repository view file save',
    )

    sendJson(res, 200, {
      path: targetPath,
      contentHash: sha256Hex(content),
      existedBefore,
    })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** `POST /api/repository/branches` -- create and switch to a new branch, reusing git-tool.ts's protected-ref/policy gate. */
export async function handleRepositoryBranchCreate(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  if (!context.policy.allowWrites) {
    sendJson(res, 403, { error: 'Write actions are disabled by runtime policy.' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const name = record['name']

  if (typeof name !== 'string' || name.trim().length === 0) {
    sendJson(res, 400, { error: 'name is required' })
    return
  }

  const gate = evaluateGitToolRequest({ operation: 'checkout_new', args: [name] }, context.policy)
  if (!gate.allowed) {
    sendJson(res, 403, { error: gate.blockReasons.join(' ') })
    return
  }

  const result = await runGitCommand(['checkout', '-b', name], context.cwd)
  if (result.exitCode !== 0) {
    sendJson(res, 400, { error: result.stderr || 'git checkout -b failed' })
    return
  }

  sendJson(res, 200, { branch: name, output: result.stdout })
}

/** `POST /api/repository/commit` -- stages the requested files (or everything, if omitted) and commits. */
export async function handleRepositoryCommit(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  if (!context.policy.allowWrites) {
    sendJson(res, 403, { error: 'Write actions are disabled by runtime policy.' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const message = record['message']
  const files = record['files']

  if (typeof message !== 'string' || message.trim().length === 0) {
    sendJson(res, 400, { error: 'message is required' })
    return
  }

  const fileList = Array.isArray(files)
    ? files.filter((entry): entry is string => typeof entry === 'string')
    : undefined

  // `.codemind/` is CodeMind's own checkpoint/session state, not user content --
  // exclude it from the default "stage everything" sweep regardless of whether
  // the target repository's own .gitignore happens to cover it, so committing
  // from this view can never accidentally check in checkpoint snapshots.
  const addArgs =
    fileList !== undefined && fileList.length > 0
      ? ['add', '--', ...fileList]
      : ['add', '-A', '--', '.', ':!.codemind']
  const addResult = await runGitCommand(addArgs, context.cwd)
  if (addResult.exitCode !== 0) {
    sendJson(res, 500, { error: addResult.stderr || 'git add failed' })
    return
  }

  const commitResult = await runGitCommand(['commit', '-m', message], context.cwd)
  if (commitResult.exitCode !== 0) {
    sendJson(res, 400, {
      error: commitResult.stderr || commitResult.stdout || 'git commit failed',
    })
    return
  }

  sendJson(res, 200, { output: commitResult.stdout })
}

/** `POST /api/repository/checkpoints/:id/restore` -- restores a checkpoint's snapshotted files back into the real working tree. */
export function handleRepositoryCheckpointRestore(
  checkpointId: string,
  res: ServerResponse,
  context: RepositoryRouteContext,
): void {
  if (!context.policy.allowWrites) {
    sendJson(res, 403, { error: 'Write actions are disabled by runtime policy.' })
    return
  }

  const checkpoint = getCheckpoint(context.cwd, checkpointId)
  if (checkpoint === undefined) {
    sendJson(res, 404, { error: `Checkpoint not found: ${checkpointId}` })
    return
  }

  const evidence = restoreCheckpoint({
    workspaceRoot: context.cwd,
    checkpointId,
    policy: context.policy,
  })

  const statusCode =
    evidence.status === 'restored'
      ? 200
      : evidence.status === 'not_found'
        ? 404
        : evidence.status === 'blocked'
          ? 403
          : 409

  sendJson(res, statusCode, evidence)
}

/** Parses `git@github.com:owner/repo.git` or `https://github.com/owner/repo.git` (or `.../owner/repo`) into `owner/repo`. Returns undefined for anything else (e.g. a non-GitHub remote). */
export function parseGitHubRemoteUrl(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim().replace(/\.git$/, '')
  const sshMatch = /^git@github\.com:([^/]+)\/(.+)$/.exec(trimmed)
  if (sshMatch !== null) {
    return `${sshMatch[1]}/${sshMatch[2]}`
  }
  const httpsMatch = /^https?:\/\/(?:[^/@]+@)?github\.com\/([^/]+)\/(.+)$/.exec(trimmed)
  if (httpsMatch !== null) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`
  }
  return undefined
}

async function detectGitHubRepository(cwd: string): Promise<string | undefined> {
  const result = await runGitCommand(['remote', 'get-url', 'origin'], cwd)
  if (result.exitCode !== 0) return undefined
  return parseGitHubRemoteUrl(result.stdout)
}

/**
 * `POST /api/repository/push` -- pushes the current branch. Requires
 * `confirm: true` in the body (a real human decision, not a default) and is
 * blocked on the same protected-ref/force-flag conditions the `git` runtime
 * tool already enforces (`evaluateGitToolRequest`), plus an extra check
 * git-tool.ts's own gate doesn't cover: pushing while directly checked out
 * on a protected branch with no explicit ref args (e.g. bare `git push`
 * while on `main`) isn't caught by the args-based force/ref check alone.
 */
export async function handleRepositoryPush(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  if (!context.policy.allowWrites) {
    sendJson(res, 403, { error: 'Write actions are disabled by runtime policy.' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (record['confirm'] !== true) {
    sendJson(res, 400, { error: 'confirm: true is required to push.' })
    return
  }

  const remote = typeof record['remote'] === 'string' ? record['remote'] : 'origin'
  const setUpstream = record['setUpstream'] === true

  const currentBranchResult = await runGitCommand(['branch', '--show-current'], context.cwd)
  const currentBranch = currentBranchResult.stdout.trim()

  if (currentBranch.length === 0) {
    sendJson(res, 400, { error: 'Not on a branch (detached HEAD?) -- cannot push.' })
    return
  }

  if (BLOCKED_REFS.includes(currentBranch)) {
    sendJson(res, 403, { error: `Cannot push directly from protected branch "${currentBranch}".` })
    return
  }

  const branch = typeof record['branch'] === 'string' ? record['branch'] : currentBranch
  const pushArgs = [remote, branch]
  const gate = evaluateGitToolRequest({ operation: 'push', args: pushArgs }, context.policy)
  if (!gate.allowed) {
    sendJson(res, 403, { error: gate.blockReasons.join(' ') })
    return
  }

  const args = setUpstream ? ['push', '-u', remote, branch] : ['push', remote, branch]
  const result = await runGitCommand(args, context.cwd, 120_000)
  if (result.exitCode !== 0) {
    sendJson(res, 502, { error: result.stderr || 'git push failed' })
    return
  }

  sendJson(res, 200, { remote, branch, output: result.stdout || result.stderr })
}

/**
 * `POST /api/repository/pull-request` -- creates a real draft PR through
 * the GitHub API (branch + commit + PR, entirely via REST -- no local
 * `git push`/credentials required), reusing the same
 * executeGitHubPrCreation/DefaultGitHubPrCreationClient the
 * github_create_pr runtime tool uses for LLM-driven PR creation. Requires
 * `confirm: true`. If no GITHUB_TOKEN is configured on the server, this
 * returns a clear error explaining that -- it does not fall back to a fake
 * client and report success.
 */
export async function handleRepositoryPullRequestCreate(
  req: IncomingMessage,
  res: ServerResponse,
  context: RepositoryRouteContext,
): Promise<void> {
  // In this route's wiring, context.policy.allowGitHubWrites is always exactly
  // "GITHUB_TOKEN is set" (see repositoryContext in codemind-chat-server.ts),
  // so checking token/client presence first gives a strictly more actionable
  // message than the generic policy-disabled error would.
  if (
    context.githubPrCreationClient === undefined &&
    (context.githubToken === undefined || context.githubToken.trim().length === 0)
  ) {
    sendJson(res, 400, {
      error:
        'GitHub PR creation requires GITHUB_TOKEN to be configured on the server. Set it and restart codemind serve.',
    })
    return
  }

  if (!context.policy.allowGitHubWrites && context.githubPrCreationClient === undefined) {
    sendJson(res, 403, { error: 'GitHub writes are disabled by runtime policy.' })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (record['confirm'] !== true) {
    sendJson(res, 400, { error: 'confirm: true is required to create a pull request.' })
    return
  }

  const baseBranch = record['baseBranch']
  const headBranch = record['headBranch']
  const title = record['title']
  const prBody = typeof record['body'] === 'string' ? record['body'] : ''
  const reason = typeof record['reason'] === 'string' ? record['reason'] : title

  if (typeof baseBranch !== 'string' || baseBranch.trim().length === 0) {
    sendJson(res, 400, { error: 'baseBranch is required' })
    return
  }
  if (typeof headBranch !== 'string' || headBranch.trim().length === 0) {
    sendJson(res, 400, { error: 'headBranch is required' })
    return
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    sendJson(res, 400, { error: 'title is required' })
    return
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    sendJson(res, 400, { error: 'reason is required' })
    return
  }

  const repository =
    typeof record['repository'] === 'string' && record['repository'].trim().length > 0
      ? record['repository']
      : await detectGitHubRepository(context.cwd)

  if (repository === undefined) {
    sendJson(res, 400, {
      error:
        'Could not determine the GitHub repository (owner/repo). Pass "repository" explicitly, or configure an "origin" remote pointing at github.com.',
    })
    return
  }

  const files = await resolvePrFiles(record['files'], context)
  if (files.length === 0) {
    sendJson(res, 400, { error: 'No changed files to include in the pull request.' })
    return
  }

  const client: GitHubPrCreationClient =
    context.githubPrCreationClient ??
    new DefaultGitHubPrCreationClient(
      new DefaultGitHubHttpClient({ token: context.githubToken ?? '' }),
    )

  const approval: RuntimeApproval = {
    ticketId: `repository-view-${Date.now()}`,
    approvedBy: 'repository-view-operator',
    scopes: ['github:write'],
  }

  const result = await executeGitHubPrCreation(
    {
      repository,
      baseBranch,
      headBranch,
      title,
      body: prBody,
      files,
      reason,
      dryRun: false,
    },
    context.policy,
    approval,
    client,
  )

  const statusCode = result.outcome === 'CREATED' ? 200 : result.outcome === 'BLOCKED' ? 403 : 200
  sendJson(res, statusCode, result)
}

/** Resolves the files to include in a PR: explicit `files` from the request body, or every changed tracked/untracked file from git status, read fresh from disk. */
async function resolvePrFiles(
  requestedFiles: unknown,
  context: RepositoryRouteContext,
): Promise<GitHubPrCreationFile[]> {
  if (Array.isArray(requestedFiles) && requestedFiles.length > 0) {
    return requestedFiles
      .filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
      .filter((entry) => typeof entry['path'] === 'string' && typeof entry['content'] === 'string')
      .map((entry) => ({ path: entry['path'] as string, content: entry['content'] as string }))
  }

  const statusResult = await runGitCommand(['status', '--porcelain=v1'], context.cwd)
  if (statusResult.exitCode !== 0) return []

  const entries = parseGitPorcelainStatus(statusResult.stdout)
  const files: GitHubPrCreationFile[] = []

  for (const entry of entries) {
    if (entry.indexStatus === 'D' || entry.worktreeStatus === 'D') continue
    // Same reasoning as the commit route: never auto-include CodeMind's own
    // checkpoint/session state in a PR built from "everything that changed".
    if (entry.path === '.codemind' || entry.path.startsWith('.codemind/')) continue
    try {
      const resolved = resolveWorkspacePath(context.cwd, entry.path)
      assertReadablePath(context.policy, context.cwd, resolved)
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue
      files.push({ path: entry.path, content: fs.readFileSync(resolved, 'utf-8') })
    } catch {
      continue
    }
  }

  return files
}
