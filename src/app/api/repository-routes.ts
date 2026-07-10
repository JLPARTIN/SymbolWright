import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { sha256Hex } from '../../checkpoint/checkpoint-hash.js'
import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { parseGitPorcelainStatus, summarizeGitStatus } from '../../runtime/git/git-status-parser.js'
import { assertReadablePath, resolveWorkspacePath } from '../../runtime/policy/runtime-policy.js'
import type { RuntimePolicySnapshot } from '../../runtime/types.js'

export interface RepositoryRouteContext {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
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
