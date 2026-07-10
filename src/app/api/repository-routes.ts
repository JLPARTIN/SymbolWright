import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  checkpointBeforeWrite,
  snapshotFileBeforeWrite,
} from '../../checkpoint/checkpoint-tool-hook.js'
import { getCheckpoint, restoreCheckpoint } from '../../checkpoint/checkpoint-service.js'
import { sha256Hex } from '../../checkpoint/checkpoint-hash.js'
import { evaluateGitToolRequest } from '../../runtime/tools/git-tool.js'
import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { parseGitPorcelainStatus, summarizeGitStatus } from '../../runtime/git/git-status-parser.js'
import { assertReadablePath, resolveWorkspacePath } from '../../runtime/policy/runtime-policy.js'
import type { RuntimePolicySnapshot, RuntimeToolContext } from '../../runtime/types.js'

export interface RepositoryRouteContext {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
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

  const addArgs =
    fileList !== undefined && fileList.length > 0 ? ['add', '--', ...fileList] : ['add', '-A']
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
