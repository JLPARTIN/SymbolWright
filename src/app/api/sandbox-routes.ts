import type { IncomingMessage, ServerResponse } from 'node:http'

import { MissionNotFoundError, type MissionService } from '../../mission/mission-service.js'
import type { CodemindRuntimeMode } from '../../runtime/types.js'
import { SandboxRequestValidationError } from '../../sandbox/sandbox-request.js'
import type { SandboxService } from '../../sandbox/sandbox-service.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
} from '../../sandbox/sandbox-types.js'

const MAX_SANDBOX_REQUEST_BYTES = 512 * 1024
const RUNTIME_MODES: readonly CodemindRuntimeMode[] = [
  'PLAN_ONLY',
  'READ_ONLY',
  'PROPOSAL_ONLY',
  'APPROVED_EXECUTION',
]

export interface SandboxRouteContext {
  readonly service: SandboxService
  readonly missionService?: MissionService
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    totalBytes += buffer.length
    if (totalBytes > MAX_SANDBOX_REQUEST_BYTES) {
      throw new SandboxRequestValidationError(
        `Request body exceeds ${MAX_SANDBOX_REQUEST_BYTES} bytes`,
      )
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new SandboxRequestValidationError('Request body must be valid JSON')
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SandboxRequestValidationError('Sandbox request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function parseRuntimeMode(record: Record<string, unknown>): CodemindRuntimeMode {
  const value = record['runtimeMode'] ?? record['modePolicy'] ?? 'APPROVED_EXECUTION'
  if (typeof value !== 'string' || !(RUNTIME_MODES as readonly string[]).includes(value)) {
    throw new SandboxRequestValidationError('runtimeMode must be a supported CodeMind runtime mode')
  }
  return value as CodemindRuntimeMode
}

function parseLimit(value: string | null, fallback: number): number {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function missionEventType(result: SandboxExecutionResult): string {
  if (result.status === 'unavailable') return 'sandbox.runtime.unavailable'
  if (result.status === 'policy-blocked') return 'sandbox.execution.blocked'
  if (result.status === 'cancelled') return 'sandbox.execution.cancelled'
  if (result.status === 'timeout') return 'sandbox.execution.failed'
  if (result.status === 'passed') return 'sandbox.execution.completed'
  return 'sandbox.execution.failed'
}

function missionEventSummary(result: SandboxExecutionResult): string {
  return `${result.languageId} ${result.runnerId} execution ${result.status}.`
}

function recordMissionEvidence(
  context: SandboxRouteContext,
  request: SandboxExecutionRequest,
  result: SandboxExecutionResult,
): void {
  if (request.missionId === undefined || context.missionService === undefined) return
  context.missionService.appendEvent(
    request.missionId,
    missionEventType(result),
    missionEventSummary(result),
    {
      executionId: result.executionId,
      languageId: result.languageId,
      runnerId: result.runnerId,
      trustClass: result.trustClass,
      backend: result.backend,
      mode: request.mode,
      status: result.status,
      durationMs: result.durationMs,
      ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
      inputHash: result.evidence.inputHash,
      ...(result.evidence.outputHash === undefined ? {} : { outputHash: result.evidence.outputHash }),
      ...(result.evidence.outputExcerpt === undefined
        ? {}
        : { outputExcerpt: result.evidence.outputExcerpt }),
      artifactReferences: result.artifacts.map((artifact) => artifact.artifactId),
      policyDecision: result.evidence.policyDecision,
      verificationLevel: result.evidence.verificationLevel,
    },
  )
}

/** Handles every authenticated `/api/sandbox` route. */
export async function handleSandboxRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: SandboxRouteContext,
): Promise<boolean> {
  if (url.pathname !== '/api/sandbox' && !url.pathname.startsWith('/api/sandbox/')) {
    return false
  }

  try {
    if (url.pathname === '/api/sandbox/runtimes') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      sendJson(res, 200, context.service.listInventory())
      return true
    }

    if (url.pathname === '/api/sandbox/runtimes/refresh') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      sendJson(res, 200, await context.service.refreshInventory())
      return true
    }

    if (url.pathname === '/api/sandbox/images') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      sendJson(res, 200, { images: context.service.listImages() })
      return true
    }

    if (url.pathname === '/api/sandbox/execute') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      const record = asRecord(await readJsonBody(req))
      const request = context.service.validateRequest(record)
      if (request.missionId !== undefined) context.missionService?.get(request.missionId)
      const result = await context.service.execute(request, {
        mode: parseRuntimeMode(record),
      })
      recordMissionEvidence(context, request, result)
      sendJson(res, 200, { result })
      return true
    }

    if (url.pathname === '/api/sandbox/executions') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      sendJson(
        res,
        200,
        context.service.listExecutions(parseLimit(url.searchParams.get('limit'), 50)),
      )
      return true
    }

    if (url.pathname.startsWith('/api/sandbox/executions/')) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      const executionId = decodeURIComponent(url.pathname.slice('/api/sandbox/executions/'.length))
      const record = context.service.getExecution(executionId)
      if (record === undefined) {
        sendJson(res, 404, { error: 'sandbox_execution_not_found' })
        return true
      }
      sendJson(res, 200, { execution: record })
      return true
    }

    if (url.pathname.startsWith('/api/sandbox/cancel/')) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      const executionId = decodeURIComponent(url.pathname.slice('/api/sandbox/cancel/'.length))
      const cancellation = await context.service.cancelExecution(executionId)
      sendJson(res, cancellation.ok ? 200 : 202, cancellation)
      return true
    }

    sendJson(res, 404, { error: 'not_found' })
    return true
  } catch (error) {
    if (error instanceof SandboxRequestValidationError) {
      sendJson(res, 400, { error: error.message })
      return true
    }
    if (error instanceof MissionNotFoundError) {
      sendJson(res, 404, { error: error.message })
      return true
    }
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
    return true
  }
}
