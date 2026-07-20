import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  MISSION_EVENT_FILTERS,
  paginateMissionEvents,
  type MissionEventFilter,
} from '../../mission/mission-events.js'
import {
  MissionNotFoundError,
  MissionRevisionConflictError,
  MissionService,
  MissionStateConflictError,
} from '../../mission/mission-service.js'
import { MissionValidationError, parseCreateMissionInput, parsePatchMissionInput } from '../../mission/mission-validation.js'

const MAX_MISSION_REQUEST_BYTES = 4 * 1024 * 1024

export interface MissionRouteContext {
  readonly service: MissionService
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

/**
 * Handles every `/api/missions` route. Returns true when the path belonged to
 * the mission subsystem, even when the specific resource was not found.
 */
export async function handleMissionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: MissionRouteContext,
): Promise<boolean> {
  if (url.pathname !== '/api/missions' && !url.pathname.startsWith('/api/missions/')) {
    return false
  }

  try {
    if (url.pathname === '/api/missions') {
      if (req.method === 'GET') {
        const offset = parseInteger(url.searchParams.get('offset'), 0)
        const limit = Math.min(200, Math.max(1, parseInteger(url.searchParams.get('limit'), 50)))
        sendJson(res, 200, context.service.list({ offset, limit }))
        return true
      }
      if (req.method === 'POST') {
        const mission = await context.service.create(parseCreateMissionInput(await readJsonBody(req)))
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
      const mission = context.service.import(record['bundle'] ?? body)
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
        const mission = context.service.patch(missionId, parsePatchMissionInput(await readJsonBody(req)))
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
