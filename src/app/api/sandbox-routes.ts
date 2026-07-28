import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  canAccessMission,
  resolveMissionVisibility,
  type TeamVisibilitySource,
} from '../../access/mission-access-guard.js'
import { MissionNotFoundError, type MissionService } from '../../mission/mission-service.js'
import type { SandboxExecutionSummary } from '../../sandbox/sandbox-history.js'
import type { SymbolWrightRuntimeMode } from '../../runtime/types.js'
import { SandboxRequestValidationError } from '../../sandbox/sandbox-request.js'
import type { SandboxService } from '../../sandbox/sandbox-service.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
} from '../../sandbox/sandbox-types.js'

const MAX_SANDBOX_REQUEST_BYTES = 512 * 1024

export interface SandboxRouteContext {
  readonly service: SandboxService
  readonly missionService?: MissionService
  readonly teamSource?: TeamVisibilitySource
  /** Undefined = operator (unrestricted), matching the convention throughout `access/`. */
  readonly callerGrantId?: string
  readonly callerPrincipalId?: string
  /** Server-derived runtime mode. Request JSON is never allowed to elevate this value. */
  readonly runtimeMode?: SymbolWrightRuntimeMode
}

/** True when the caller may see an execution it doesn't directly own by grant id: the operator
 * always can; a delegated caller can when the execution is linked to a mission it can read
 * (`canAccessMission`). An execution recorded before this ownership metadata existed, or with
 * neither a `missionId` nor a matching `ownerGrantId`, is operator-only -- fail closed rather
 * than guess at who may have created it. */
function callerCanSeeExecution(
  execution: { readonly missionId?: string; readonly ownerGrantId?: string },
  context: SandboxRouteContext,
): boolean {
  if (context.callerGrantId === undefined) return true
  if (execution.ownerGrantId === context.callerGrantId) return true
  if (execution.missionId === undefined || context.missionService === undefined) return false
  let mission
  try {
    mission = context.missionService.get(execution.missionId)
  } catch {
    return false
  }
  const visibility = resolveMissionVisibility(context.callerGrantId, context.teamSource)
  return canAccessMission(mission, visibility, 'read').allowed
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
function requestedMissionId(record: Record<string, unknown>): string | undefined {
  const value = record['missionId']
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new SandboxRequestValidationError('missionId must be a string')
  }
  return value
}

function requestsTrustedLocalHost(record: Record<string, unknown>): boolean {
  const requestedRunnerId = record['requestedRunnerId']
  return typeof requestedRunnerId === 'string' && requestedRunnerId.startsWith('guarded-host-')
}

function bindRepositoryToMissionWorkspace(
  record: Record<string, unknown>,
  missionWorkspaceRoot: string | undefined,
): Record<string, unknown> {
  const rawRepository = record['repository']
  if (rawRepository === undefined) return record
  if (typeof rawRepository !== 'object' || rawRepository === null || Array.isArray(rawRepository)) {
    return record
  }
  const repository = rawRepository as Record<string, unknown>
  if ('rootPath' in repository) {
    throw new SandboxRequestValidationError(
      'repository.rootPath is server-controlled and must not be supplied by the caller',
    )
  }
  if (missionWorkspaceRoot === undefined) {
    throw new SandboxRequestValidationError(
      'Repository sandbox execution requires a missionId bound to a server-managed workspace',
    )
  }
  return {
    ...record,
    repository: {
      ...repository,
      rootPath: missionWorkspaceRoot,
    },
  }
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
      ...(result.evidence.outputHash === undefined
        ? {}
        : { outputHash: result.evidence.outputHash }),
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
      if (requestsTrustedLocalHost(record)) {
        sendJson(res, 403, {
          error: 'trusted_local_host_execution_forbidden',
          reasonCode: 'GUARDED_HOST_HTTP_FORBIDDEN',
          message:
            'Trusted local host execution is a local operator break-glass path and is never available through the HTTP sandbox API.',
        })
        return true
      }

      const missionId = requestedMissionId(record)
      let missionWorkspaceRoot: string | undefined
      let effectiveRuntimeMode = context.runtimeMode ?? 'APPROVED_EXECUTION'
      if (missionId !== undefined) {
        if (context.missionService === undefined) {
          throw new SandboxRequestValidationError(
            'missionId cannot be resolved because no mission service is configured',
          )
        }
        const mission = context.missionService.get(missionId)
        const visibility = resolveMissionVisibility(context.callerGrantId, context.teamSource)
        const access = canAccessMission(mission, visibility, 'execute')
        if (!access.allowed) {
          if (access.relationship === 'none') {
            sendJson(res, 404, { error: `Mission not found: ${missionId}` })
          } else {
            sendJson(res, 403, {
              error: 'authorization_denied',
              reasonCode: 'MISSION_NOT_AUTHORIZED_FOR_OPERATION',
              message: `This grant may not run a sandbox execution against mission ${missionId}.`,
            })
          }
          return true
        }
        missionWorkspaceRoot = mission.repository.rootPath
        effectiveRuntimeMode = mission.agent.runtimeMode
      }

      const securedRecord = bindRepositoryToMissionWorkspace(record, missionWorkspaceRoot)
      const request = context.service.validateRequest(securedRecord)
      const result = await context.service.execute(request, {
        mode: effectiveRuntimeMode,
        ...(context.callerGrantId === undefined
          ? {}
          : {
              ownership: {
                ownerGrantId: context.callerGrantId,
                ...(context.callerPrincipalId === undefined
                  ? {}
                  : { ownerPrincipalId: context.callerPrincipalId }),
              },
            }),
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
      const list = context.service.listExecutions(parseLimit(url.searchParams.get('limit'), 50))
      const executions: readonly SandboxExecutionSummary[] = list.executions.filter((execution) =>
        callerCanSeeExecution(execution, context),
      )
      sendJson(res, 200, { ...list, executions })
      return true
    }

    if (url.pathname.startsWith('/api/sandbox/executions/')) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' })
        return true
      }
      const executionId = decodeURIComponent(url.pathname.slice('/api/sandbox/executions/'.length))
      const record = context.service.getExecution(executionId)
      if (record === undefined || !callerCanSeeExecution(record, context)) {
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
      const existing = context.service.getExecution(executionId)
      if (existing !== undefined && !callerCanSeeExecution(existing, context)) {
        sendJson(res, 404, { error: 'sandbox_execution_not_found' })
        return true
      }
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
