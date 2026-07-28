import type { IncomingMessage, ServerResponse } from 'node:http'

import type { AccessRuntime } from '../../access/access-runtime.js'
import {
  canAccessMission,
  resolveMissionVisibility,
  type MissionOperation,
  type TeamVisibilitySource,
} from '../../access/mission-access-guard.js'
import { checkRequirePullRequest } from '../../access/require-pull-request-guard.js'
import type { ShutdownLifecycle } from '../server/http-bootstrap.js'
import { createServerAutonomyRuntime } from '../../autonomy/server-autonomy-runtime.js'
import {
  MISSION_EVENT_FILTERS,
  paginateMissionEvents,
  type MissionEventFilter,
} from '../../mission/mission-events.js'
import {
  MissionNotFoundError,
  MissionRevisionConflictError,
  MissionStateConflictError,
} from '../../mission/mission-service.js'
import type { MissionService } from '../../mission/mission-service.js'
import type {
  MissionCheckpointReference,
  MissionValidationEvidence,
} from '../../mission/mission-types.js'
import {
  MissionValidationError,
  parseCreateMissionInput,
  parsePatchMissionInput,
} from '../../mission/mission-validation.js'
import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { handleAutonomousMissionRoute } from './autonomous-mission-routes.js'

const MAX_MISSION_REQUEST_BYTES = 4 * 1024 * 1024
const VALIDATION_STATUSES = ['running', 'passed', 'failed', 'blocked', 'interrupted'] as const
const AUTONOMY_RUNTIMES = new WeakMap<
  MissionService,
  ReturnType<typeof createServerAutonomyRuntime>
>()

export interface MissionRouteContext {
  readonly service: MissionService
  readonly cwd: string
  /** The calling delegated-access grant's id, when the caller is an agent-token principal — set
   * per-request by `symbolwright-chat-server.ts`, never parsed from the request body. Recorded on
   * created missions and used to enforce `executionLimits.maxConcurrentMissions`. */
  readonly grantId?: string
  /** Stable (not per-request) reference used to look up a mission's owning grant during
   * autonomous execution — e.g. to source `executionLimits.maxRepairAttempts` for that specific
   * mission's repair loop. Distinct from `grantId` above, which is per-request and only used at
   * mission-creation time. */
  readonly accessRuntime?: AccessRuntime
  /** Read-only view onto the orchestration store's teams, used to resolve which missions a
   * delegated caller can see via active team membership (see `mission-access-guard.ts`). Stable
   * across requests, like `accessRuntime`. Omitted entirely, visibility degrades to
   * direct-ownership-only (no team-derived access), never to "see everything". */
  readonly teamSource?: TeamVisibilitySource
  /** Lets the lazily-constructed autonomy runtime register a "abort every in-flight execution"
   * hook the first time it's built for this `service`, so a server shutdown can reach missions
   * that are autonomously executing even though this runtime lives outside the HTTP-server-level
   * composition `http-bootstrap.ts` knows about. Stable across requests, like `accessRuntime`. */
  readonly shutdownLifecycle?: ShutdownLifecycle
}

/** Maps a `/api/missions/:id/autonomy[/:action]` request onto the access-guard operation it
 * requires. `undefined` means "not a recognized action for this method" — the ownership check
 * is skipped and `handleAutonomousMissionRoute` is left to respond with its own `405`, so a
 * mismatched method never becomes a confusing `404`/`403` (or an ownership-check mission lookup
 * against an id that was never going to be used) instead of "method not allowed". Every
 * recognized autonomy action is POST-only today except the dashboard (`GET`, no action). */
function missionOperationForAutonomyAction(
  action: string | undefined,
  method: string | undefined,
): MissionOperation | undefined {
  if (action === undefined) return method === 'GET' ? 'read' : undefined
  if (method !== 'POST') return undefined
  if (action === 'start' || action === 'resume' || action === 'pause' || action === 'retry') {
    return 'execute'
  }
  // `cancel`/`release` stop or ship the mission's autonomous work outright -- reserved for the
  // mission/team owner or operator, not any active contributing team member.
  if (action === 'cancel' || action === 'release') return 'manage'
  return undefined
}

/** Same shape as `missionOperationForAutonomyAction`, for direct `/api/missions/:id[/:action]`
 * routes. `record` is the one write action available to an active *contributing* team member
 * (it's how in-progress evidence gets appended during real work); every other mutation --
 * lifecycle transitions, branch switching, deletion -- is reserved for owner/operator. Each
 * action is gated on the one HTTP method it actually supports, same reasoning as the autonomy
 * mapping above. */
function missionOperationForDirectAction(
  action: string | undefined,
  method: string | undefined,
): MissionOperation | undefined {
  if (action === undefined) {
    if (method === 'GET') return 'read'
    if (method === 'PATCH') return 'manage'
    if (method === 'DELETE') return 'destructive'
    return undefined
  }
  if (action === 'events') return method === 'GET' ? 'read' : undefined
  if (action === 'export') return method === 'POST' ? 'read' : undefined
  if (action === 'record') return method === 'POST' ? 'contribute' : undefined
  if (method !== 'POST') return undefined
  if (
    action === 'pause' ||
    action === 'resume' ||
    action === 'complete' ||
    action === 'abandon' ||
    action === 'reopen' ||
    action === 'attach-scratch' ||
    action === 'switch-recorded-branch' ||
    action === 'checkpoint-label'
  ) {
    return 'manage'
  }
  return undefined
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function autonomyRuntime(context: MissionRouteContext) {
  const existing = AUTONOMY_RUNTIMES.get(context.service)
  if (existing !== undefined) return existing
  const runtime = createServerAutonomyRuntime({
    workspaceRoot: context.cwd,
    missionService: context.service,
    hasGitHubToken: process.env['GITHUB_TOKEN'] !== undefined,
    ...(context.accessRuntime === undefined ? {} : { accessRuntime: context.accessRuntime }),
  })
  AUTONOMY_RUNTIMES.set(context.service, runtime)
  // Registered once per runtime, not per request -- a graceful shutdown must reach every mission
  // this process is currently executing autonomously, not just the one the shutdown-triggering
  // request happens to be about.
  context.shutdownLifecycle?.onBeforeShutdown(() => {
    runtime.abortRegistry.requestAbortAll('shutdown')
  })
  return runtime
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    totalBytes += buffer.length
    if (totalBytes > MAX_MISSION_REQUEST_BYTES) {
      throw new MissionValidationError(`Request body exceeds ${MAX_MISSION_REQUEST_BYTES} bytes`)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new MissionValidationError('Request body must be valid JSON')
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MissionValidationError('Request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MissionValidationError(`${field} must be a non-empty string`)
  }
  return value.trim()
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new MissionValidationError(`${field} must be a string`)
  return value.trim()
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new MissionValidationError(`${field} must be an array`)
  return value.map((entry) => {
    if (typeof entry !== 'string') throw new MissionValidationError(`${field} must contain strings`)
    return entry
  })
}

function parseRevision(record: Record<string, unknown>): number {
  const revision = record['revision']
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    throw new MissionValidationError('revision must be a positive integer')
  }
  return revision
}

function parseInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function isMissionEventFilter(value: string | null): value is MissionEventFilter {
  return value !== null && (MISSION_EVENT_FILTERS as readonly string[]).includes(value)
}

function parseCheckpointReference(raw: unknown): MissionCheckpointReference | undefined {
  if (raw === undefined) return undefined
  const record = asRecord(raw)
  const checkpointId = requiredString(record, 'checkpointId')
  const createdAt = requiredString(record, 'createdAt')
  const paths = stringArray(record['paths'] ?? [], 'checkpoint.paths')
  const triggeringToolCallId = optionalString(record, 'triggeringToolCallId')
  const label = optionalString(record, 'label')
  return {
    checkpointId,
    createdAt,
    paths,
    ...(triggeringToolCallId === undefined ? {} : { triggeringToolCallId }),
    ...(label === undefined ? {} : { label }),
  }
}

function parseValidationEvidence(raw: unknown): MissionValidationEvidence {
  const record = asRecord(raw)
  const status = record['status']
  if (typeof status !== 'string' || !(VALIDATION_STATUSES as readonly string[]).includes(status)) {
    throw new MissionValidationError('validation.status is invalid')
  }
  const exitCode = record['exitCode']
  if (exitCode !== undefined && (typeof exitCode !== 'number' || !Number.isInteger(exitCode))) {
    throw new MissionValidationError('validation.exitCode must be an integer')
  }
  const completedAt = optionalString(record, 'completedAt')
  const outputExcerpt = optionalString(record, 'outputExcerpt')
  const outputHash = optionalString(record, 'outputHash')
  return {
    id: requiredString(record, 'id'),
    command: requiredString(record, 'command'),
    startedAt: requiredString(record, 'startedAt'),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(exitCode === undefined ? {} : { exitCode }),
    status: status as MissionValidationEvidence['status'],
    summary: requiredString(record, 'summary'),
    ...(outputExcerpt === undefined ? {} : { outputExcerpt }),
    ...(outputHash === undefined ? {} : { outputHash }),
  }
}

async function handleRecordAction(
  missionId: string,
  record: Record<string, unknown>,
  context: MissionRouteContext,
): Promise<void> {
  const kind = requiredString(record, 'kind')
  if (kind === 'file-opened') {
    context.service.recordFileOpened(
      missionId,
      requiredString(record, 'path'),
      optionalString(record, 'contentHash'),
    )
    return
  }
  if (kind === 'file-saved') {
    context.service.recordFileSaved(
      missionId,
      requiredString(record, 'path'),
      requiredString(record, 'contentHash'),
      parseCheckpointReference(record['checkpoint']),
    )
    return
  }
  if (kind === 'file-conflict') {
    context.service.recordFileConflict(missionId, requiredString(record, 'path'))
    return
  }
  if (kind === 'diff-viewed') {
    context.service.recordDiffViewed(missionId, requiredString(record, 'path'))
    return
  }
  if (kind === 'repository-state') {
    const branch = optionalString(record, 'branch')
    const headSha = optionalString(record, 'headSha')
    const modifiedPaths =
      record['modifiedPaths'] === undefined
        ? undefined
        : stringArray(record['modifiedPaths'], 'modifiedPaths')
    context.service.recordRepositoryState(missionId, {
      ...(branch === undefined ? {} : { branch }),
      ...(headSha === undefined ? {} : { headSha }),
      ...(modifiedPaths === undefined ? {} : { modifiedPaths }),
    })
    return
  }
  if (kind === 'branch-changed') {
    const branch = requiredString(record, 'branch')
    const headSha = optionalString(record, 'headSha')
    context.service.recordBranchChanged(missionId, branch, headSha)
    return
  }
  if (kind === 'commit-created') {
    const mission = context.service.get(missionId)
    const result = await runGitCommand(['rev-parse', 'HEAD'], mission.repository.rootPath)
    if (result.exitCode !== 0)
      throw new MissionStateConflictError('Could not read the new commit SHA')
    context.service.recordCommit(
      missionId,
      result.stdout.trim(),
      optionalString(record, 'summary') ?? 'Git commit created.',
    )
    return
  }
  if (kind === 'push-completed') {
    context.service.recordPush(
      missionId,
      requiredString(record, 'branch'),
      optionalString(record, 'remote') ?? 'origin',
    )
    return
  }
  if (kind === 'pr-created') {
    context.service.recordPullRequest(missionId, requiredString(record, 'pullRequestUrl'))
    return
  }
  if (kind === 'checkpoint-restored') {
    context.service.recordCheckpointRestored(missionId, requiredString(record, 'checkpointId'))
    return
  }
  if (kind === 'validation') {
    context.service.recordValidation(missionId, parseValidationEvidence(record['validation']))
    return
  }
  throw new MissionValidationError(`Unsupported mission record kind: ${kind}`)
}

async function switchToRecordedBranch(
  missionId: string,
  revision: number,
  context: MissionRouteContext,
): Promise<void> {
  const mission = context.service.get(missionId)
  if (mission.revision !== revision) throw new MissionRevisionConflictError(mission)
  const recordedBranch = mission.repository.branch
  if (recordedBranch === undefined) {
    throw new MissionStateConflictError('Mission has no recorded branch')
  }
  const status = await runGitCommand(['status', '--porcelain=v1'], mission.repository.rootPath)
  if (status.exitCode !== 0 || status.stdout.trim().length > 0) {
    throw new MissionStateConflictError(
      'Repository has uncommitted changes. Commit, stash, or discard them before switching branches.',
    )
  }
  const exists = await runGitCommand(
    ['show-ref', '--verify', '--quiet', `refs/heads/${recordedBranch}`],
    mission.repository.rootPath,
  )
  if (exists.exitCode !== 0)
    throw new MissionStateConflictError('The recorded branch no longer exists')
  const checkout = await runGitCommand(['checkout', recordedBranch], mission.repository.rootPath)
  if (checkout.exitCode !== 0) {
    throw new MissionStateConflictError(checkout.stderr || 'Could not switch branches')
  }
  const head = await runGitCommand(['rev-parse', 'HEAD'], mission.repository.rootPath)
  context.service.recordBranchChanged(
    missionId,
    recordedBranch,
    head.exitCode === 0 ? head.stdout.trim() : undefined,
  )
}

/** Handles every authenticated `/api/missions` route. */
export async function handleMissionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: MissionRouteContext,
): Promise<boolean> {
  if (url.pathname !== '/api/missions' && !url.pathname.startsWith('/api/missions/')) {
    return false
  }

  // Resource-instance ownership check -- runs before *any* dispatch (including into
  // `handleAutonomousMissionRoute`, which has no notion of caller identity of its own) for every
  // route shaped `/api/missions/:id[...]` other than the collection routes handled below. A
  // capability-class check (route-capability-map.ts) only establishes that the caller may use
  // `symbolwright.mission.read`/`.execute`/etc. *in general* -- this establishes that they may
  // use it against *this specific mission*.
  if (url.pathname !== '/api/missions' && url.pathname !== '/api/missions/import') {
    const autonomyMatch = /^\/api\/missions\/([^/]+)\/autonomy(?:\/([^/]+))?$/.exec(url.pathname)
    const directMatch = /^\/api\/missions\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname)
    const candidateId = autonomyMatch?.[1] ?? directMatch?.[1]
    const operation =
      autonomyMatch !== null
        ? missionOperationForAutonomyAction(autonomyMatch[2], req.method)
        : missionOperationForDirectAction(directMatch?.[2], req.method)
    if (candidateId !== undefined && operation !== undefined) {
      let mission
      try {
        mission = context.service.get(candidateId)
      } catch (error) {
        if (error instanceof MissionNotFoundError) {
          sendJson(res, 404, { error: error.message })
          return true
        }
        // A malformed id (fails `isValidMissionId`) throws a plain `Error` here, before this
        // check ever reaches the function's main try/catch below -- without this fallback it
        // would propagate uncaught instead of degrading to the same 500 that path already
        // returns for an unexpected error.
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        return true
      }
      const visibility = resolveMissionVisibility(context.grantId, context.teamSource)
      const access = canAccessMission(mission, visibility, operation)
      if (!access.allowed) {
        if (access.relationship === 'none') {
          sendJson(res, 404, { error: `Mission not found: ${candidateId}` })
        } else {
          sendJson(res, 403, {
            error: 'authorization_denied',
            reasonCode: 'MISSION_NOT_AUTHORIZED_FOR_OPERATION',
            message: `This grant may not perform "${operation}" on mission ${candidateId}.`,
          })
        }
        return true
      }
    }
  }

  const runtime = autonomyRuntime(context)
  if (
    await handleAutonomousMissionRoute(req, res, url, {
      coordinator: runtime.coordinator,
      control: runtime.control,
    })
  ) {
    return true
  }

  try {
    if (url.pathname === '/api/missions') {
      if (req.method === 'GET') {
        const offset = parseInteger(url.searchParams.get('offset'), 0)
        const limit = Math.min(200, Math.max(1, parseInteger(url.searchParams.get('limit'), 50)))
        const visibility = resolveMissionVisibility(context.grantId, context.teamSource)
        sendJson(
          res,
          200,
          context.service.list({
            offset,
            limit,
            ...(context.grantId === undefined ? {} : { visibility }),
          }),
        )
        return true
      }
      if (req.method === 'POST') {
        const mission = await context.service.create(
          parseCreateMissionInput(await readJsonBody(req)),
          context.grantId === undefined ? {} : { grantId: context.grantId },
        )
        sendJson(res, 201, {
          mission,
          reconciliation: await context.service.reconcileRepository(mission.id),
        })
        return true
      }
      sendJson(res, 405, { error: 'method_not_allowed' })
      return true
    }

    if (url.pathname === '/api/missions/import') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      const body = await readJsonBody(req)
      const record = asRecord(body)
      const mission = context.service.import(
        record['bundle'] ?? body,
        context.grantId === undefined ? {} : { grantId: context.grantId },
      )
      sendJson(res, 201, { mission })
      return true
    }

    const segments = url.pathname.split('/').filter((segment) => segment.length > 0)
    const missionId = segments[2]
    if (missionId === undefined) {
      sendJson(res, 404, { error: 'not_found' })
      return true
    }
    const action = segments[3]

    if (action === undefined) {
      if (req.method === 'GET') {
        const mission = context.service.get(missionId)
        sendJson(res, 200, {
          mission,
          reconciliation: await context.service.reconcileRepository(missionId),
        })
        return true
      }
      if (req.method === 'PATCH') {
        const mission = context.service.patch(
          missionId,
          parsePatchMissionInput(await readJsonBody(req)),
        )
        sendJson(res, 200, { mission })
        return true
      }
      if (req.method === 'DELETE') {
        const record = asRecord(await readJsonBody(req))
        context.service.delete(missionId, parseRevision(record), record['confirm'] === true)
        sendJson(res, 200, { ok: true, missionId })
        return true
      }
      sendJson(res, 405, { error: 'method_not_allowed' })
      return true
    }

    if (action === 'events') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      const filterRaw = url.searchParams.get('filter')
      const filter = isMissionEventFilter(filterRaw) ? filterRaw : 'all'
      sendJson(
        res,
        200,
        paginateMissionEvents(context.service.readEvents(missionId), {
          offset: parseInteger(url.searchParams.get('offset'), 0),
          limit: Math.min(500, Math.max(1, parseInteger(url.searchParams.get('limit'), 100))),
          filter,
        }),
      )
      return true
    }

    if (action === 'export') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      sendJson(res, 200, context.service.export(missionId))
      return true
    }

    if (action === 'record') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      await handleRecordAction(missionId, asRecord(await readJsonBody(req)), context)
      sendJson(res, 200, { mission: context.service.get(missionId) })
      return true
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' })
      return true
    }

    const record = asRecord(await readJsonBody(req))
    const revision = parseRevision(record)
    if (action === 'pause') {
      sendJson(res, 200, { mission: context.service.pause(missionId, revision) })
      return true
    }
    if (action === 'resume') {
      const mission = context.service.resume(missionId, revision)
      sendJson(res, 200, {
        mission,
        reconciliation: await context.service.reconcileRepository(missionId),
      })
      return true
    }
    if (action === 'complete') {
      const mission = context.service.get(missionId)
      if (mission.grantId !== undefined && context.accessRuntime !== undefined) {
        const unmet = checkRequirePullRequest(
          context.accessRuntime,
          mission.grantId,
          mission.references.pullRequestUrls,
        )
        if (unmet !== undefined) {
          sendJson(res, 403, {
            error: 'execution_limit_exceeded',
            reasonCode: 'PULL_REQUEST_REQUIRED',
            message:
              'This grant requires a pull request before a mission can be marked complete, and none has been recorded yet.',
          })
          return true
        }
      }
      sendJson(res, 200, { mission: context.service.complete(missionId, revision) })
      return true
    }
    if (action === 'abandon') {
      sendJson(res, 200, { mission: context.service.abandon(missionId, revision) })
      return true
    }
    if (action === 'reopen') {
      sendJson(res, 200, { mission: context.service.reopenCompleted(missionId, revision) })
      return true
    }
    if (action === 'attach-scratch') {
      const scratchState = asRecord(record['scratchState'])
      sendJson(res, 200, {
        mission: context.service.attachScratchWorkspace(missionId, revision, scratchState),
      })
      return true
    }
    if (action === 'switch-recorded-branch') {
      await switchToRecordedBranch(missionId, revision, context)
      sendJson(res, 200, {
        mission: context.service.get(missionId),
        reconciliation: await context.service.reconcileRepository(missionId),
      })
      return true
    }
    if (action === 'checkpoint-label') {
      sendJson(res, 200, {
        mission: context.service.labelCheckpoint(
          missionId,
          requiredString(record, 'checkpointId'),
          requiredString(record, 'label'),
        ),
      })
      return true
    }

    sendJson(res, 404, { error: 'not_found' })
    return true
  } catch (error) {
    if (error instanceof MissionRevisionConflictError) {
      sendJson(res, 409, {
        error: error.message,
        currentRevision: error.current.revision,
        mission: error.current,
      })
      return true
    }
    if (error instanceof MissionNotFoundError) {
      sendJson(res, 404, { error: error.message })
      return true
    }
    if (error instanceof MissionValidationError) {
      sendJson(res, 400, { error: error.message })
      return true
    }
    if (error instanceof MissionStateConflictError) {
      sendJson(res, 409, { error: error.message })
      return true
    }
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    return true
  }
}
