import type { IncomingMessage, ServerResponse } from 'node:http'

import type { AutonomousMissionControl } from '../../autonomy/autonomous-mission-control.js'
import type { AutonomousMissionCoordinator } from '../../autonomy/autonomous-mission-coordinator.js'
import type { AutonomousMissionReleaseService } from '../../autonomy/autonomous-mission-release.js'

export interface AutonomousMissionRouteContext {
  readonly coordinator: AutonomousMissionCoordinator
  readonly control: AutonomousMissionControl
  readonly release: AutonomousMissionReleaseService
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export async function handleAutonomousMissionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: AutonomousMissionRouteContext,
): Promise<boolean> {
  const match = /^\/api\/missions\/([^/]+)\/autonomy(?:\/([^/]+))?$/.exec(url.pathname)
  if (match === null) return false
  const missionId = match[1]
  const action = match[2]
  if (missionId === undefined) {
    sendJson(res, 404, { error: 'not_found' })
    return true
  }

  try {
    if (action === undefined && req.method === 'GET') {
      sendJson(res, 200, await dashboardPayload(context, missionId))
      return true
    }
    if (action === 'release' && req.method === 'POST') {
      sendJson(res, 200, { release: await context.release.execute(missionId) })
      return true
    }
    if (action === 'start' && req.method === 'POST') {
      const result = await context.coordinator.start(missionId)
      sendJson(res, 202, {
        ...result,
        ...(await specialistPayload(context, missionId)),
      })
      return true
    }
    if (action === 'resume' && req.method === 'POST') {
      const result = await context.coordinator.resume(missionId)
      sendJson(res, 202, {
        ...result,
        ...(await specialistPayload(context, missionId)),
      })
      return true
    }
    if (action === 'pause' && req.method === 'POST') {
      sendJson(res, 202, { execution: await context.control.pause(missionId) })
      return true
    }
    if (action === 'cancel' && req.method === 'POST') {
      sendJson(res, 202, { execution: await context.control.cancel(missionId) })
      return true
    }
    if (action === 'retry' && req.method === 'POST') {
      const execution = await context.control.retry(missionId)
      sendJson(res, 202, {
        execution,
        ...(await dashboardPayload(context, missionId)),
      })
      return true
    }
    sendJson(res, 405, { error: 'method_not_allowed' })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('not found') || message.includes('was not found')) {
      sendJson(res, 404, { error: message })
      return true
    }
    sendJson(res, 409, { error: message })
    return true
  }
}

async function dashboardPayload(
  context: AutonomousMissionRouteContext,
  missionId: string,
): Promise<Record<string, unknown>> {
  const [dashboard, specialists, release] = await Promise.all([
    context.coordinator.status(missionId),
    context.coordinator.specialists(missionId),
    context.release.load(missionId),
  ])
  return {
    dashboard,
    ...(specialists === undefined ? {} : { specialists }),
    ...(release === undefined ? {} : { release }),
  }
}

async function specialistPayload(
  context: AutonomousMissionRouteContext,
  missionId: string,
): Promise<Record<string, unknown>> {
  const specialists = await context.coordinator.specialists(missionId)
  return specialists === undefined ? {} : { specialists }
}
