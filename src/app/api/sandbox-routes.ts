import type { IncomingMessage, ServerResponse } from 'node:http'

import type { AccessRuntime } from '../../access/access-runtime.js'
import {
  AuthorizationDeniedError,
  ApprovalRequiredError,
} from '../../access/authorization-service.js'
import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from '../../access/sandbox-capabilities.js'
import {
  grantAllowsDependencyAcquisition,
  grantAllowsOfflineSandbox,
  resolveGrantSandboxPolicyReferences,
} from '../../access/sandbox-policy-compat.js'
import {
  canAccessMission,
  resolveMissionVisibility,
  type TeamVisibilitySource,
} from '../../access/mission-access-guard.js'
import { MissionNotFoundError, type MissionService } from '../../mission/mission-service.js'
import type { SymbolWrightMission } from '../../mission/mission-types.js'
import {
  bindDependencyApproval,
  buildDependencyAuthorization,
  dependencyAuthorizationMetadata,
} from '../../sandbox/dependency-acquisition-authority.js'
import { runWithSandboxDependencyLayer } from '../../sandbox/sandbox-dependency-execution-context.js'
import type { SandboxExecutionSummary } from '../../sandbox/sandbox-history.js'
import {
  acquireGovernedNpmDependencies,
  parseGovernedDependencyAcquisitionRequest,
  renderGovernedDependencyAcquisitionResult,
} from '../../sandbox/governed-dependency-acquisition.js'
import { recordDependencyAcquisitionMissionEvidence } from '../../sandbox/dependency-mission-evidence.js'
import { getOrCreateApplicationSandboxNetworkRuntime } from '../../sandbox/sandbox-network-runtime.js'
import { SandboxRequestValidationError } from '../../sandbox/sandbox-request.js'
import type { SandboxService } from '../../sandbox/sandbox-service.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
} from '../../sandbox/sandbox-types.js'
import type { SymbolWrightRuntimeMode } from '../../runtime/types.js'

const MAX_SANDBOX_REQUEST_BYTES = 512 * 1024

export interface SandboxRouteContext {
  readonly service: SandboxService
  readonly missionService?: MissionService
  readonly accessRuntime?: AccessRuntime
  readonly deploymentMode?: 'local' | 'hosted'
  /** Application workspace root; the server currently passes its bound cwd here. */
  readonly repositoryId?: string
  readonly teamSource?: TeamVisibilitySource
  /** Undefined = operator (unrestricted), matching the convention throughout `access/`. */
  readonly callerGrantId?: string
  readonly callerPrincipalId?: string
  /** Server-derived runtime mode. Request JSON is never allowed to elevate this value. */
  readonly runtimeMode?: SymbolWrightRuntimeMode
}

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
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
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
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SandboxRequestValidationError('missionId must be a non-empty string')
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
    repository: { ...repository, rootPath: missionWorkspaceRoot },
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

function recordMissionEvidence(
  context: SandboxRouteContext,
  request: SandboxExecutionRequest,
  result: SandboxExecutionResult,
): void {
  if (request.missionId === undefined || context.missionService === undefined) return
  context.missionService.appendEvent(
    request.missionId,
    missionEventType(result),
    `${result.languageId} ${result.runnerId} execution ${result.status}.`,
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
      ...(result.evidence.decisionCode === undefined
        ? {}
        : { decisionCode: result.evidence.decisionCode }),
      ...(result.evidence.policy === undefined
        ? {}
        : {
            sandboxPolicy: {
              id: result.evidence.policy.id,
              version: result.evidence.policy.version,
              fingerprint: result.evidence.policy.fingerprint,
              intent: result.evidence.policy.intent,
              networkMode: result.evidence.policy.networkMode,
              dependencyMode: result.evidence.policy.dependencyMode,
            },
          }),
    },
  )
}

function applicationWorkspaceRoot(context: SandboxRouteContext): string {
  return context.repositoryId ?? process.cwd()
}

function networkRuntime(context: SandboxRouteContext, workspaceRoot?: string) {
  return getOrCreateApplicationSandboxNetworkRuntime({
    workspaceRoot: workspaceRoot ?? applicationWorkspaceRoot(context),
  })
}

function resolveMissionForExecution(
  context: SandboxRouteContext,
  missionId: string,
):
  | {
      readonly mission: SymbolWrightMission
      readonly callerKind: 'operator' | 'delegated-grant' | 'team-member'
    }
  | undefined {
  if (context.missionService === undefined) {
    throw new SandboxRequestValidationError(
      'missionId cannot be resolved because no mission service is configured',
    )
  }
  const mission = context.missionService.get(missionId)
  const visibility = resolveMissionVisibility(context.callerGrantId, context.teamSource)
  const access = canAccessMission(mission, visibility, 'execute')
  const callerKind =
    access.relationship === 'team_member' || access.relationship === 'team_owner'
      ? 'team-member'
      : context.callerGrantId === undefined
        ? 'operator'
        : 'delegated-grant'
  return access.allowed ? { mission, callerKind } : undefined
}

async function handleDependencyAcquisition(
  req: IncomingMessage,
  res: ServerResponse,
  context: SandboxRouteContext,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }
  const body = asRecord(await readJsonBody(req))
  const missionId = requestedMissionId(body)
  if (missionId === undefined) {
    throw new SandboxRequestValidationError(
      'missionId is required for governed dependency acquisition',
    )
  }
  const resolved = resolveMissionForExecution(context, missionId)
  if (resolved === undefined) {
    sendJson(res, 404, { error: `Mission not found: ${missionId}` })
    return
  }
  const { mission, callerKind } = resolved
  const runtime = networkRuntime(context, mission.repository.rootPath)
  const callerGrant =
    context.callerGrantId === undefined
      ? undefined
      : context.accessRuntime?.grantService.getGrant(context.callerGrantId)
  if (context.callerGrantId !== undefined && callerGrant === undefined) {
    sendJson(res, 403, {
      error: 'authorization_denied',
      reasonCode: 'DEPENDENCY_GRANT_NOT_FOUND',
      message: 'The delegated dependency grant no longer exists.',
    })
    return
  }
  const references =
    callerGrant === undefined ? undefined : resolveGrantSandboxPolicyReferences(callerGrant)
  if (references?.unsupportedReason !== undefined) {
    sendJson(res, 403, {
      error: 'authorization_denied',
      reasonCode: 'SANDBOX_LEGACY_NETWORK_UNSUPPORTED',
      message: references.unsupportedReason,
    })
    return
  }
  const policyReference =
    callerGrant === undefined
      ? runtime.defaultDependencyPolicyReference
      : references?.references.dependency
  if (policyReference === undefined) {
    sendJson(res, 403, {
      error: 'authorization_denied',
      reasonCode: 'DEPENDENCY_POLICY_REFERENCE_REQUIRED',
      message: 'No operator-owned dependency policy is bound to this caller.',
    })
    return
  }
  let authorization = buildDependencyAuthorization({
    policyReference,
    deploymentMode: context.deploymentMode ?? 'local',
    callerKind,
    runtimeMode: mission.agent.runtimeMode,
    repositoryId: mission.repository.remoteUrl ?? mission.repository.rootPath,
    workspaceId: mission.id,
    missionId: mission.id,
    ...(context.callerPrincipalId === undefined ? {} : { principalId: context.callerPrincipalId }),
    ...(callerGrant === undefined
      ? { capabilityApproved: true, operatorApproved: true }
      : {
          grantId: callerGrant.id,
          grantVersion: callerGrant.version,
          capabilityApproved: grantAllowsDependencyAcquisition(callerGrant),
        }),
  })
  const request = parseGovernedDependencyAcquisitionRequest(
    Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'missionId')),
  )

  if (callerGrant !== undefined && context.accessRuntime !== undefined) {
    try {
      const decision = await context.accessRuntime.authorizationService.requireAuthorized({
        principalId: callerGrant.principalId,
        grantId: callerGrant.id,
        capability: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
        repository: mission.repository.remoteUrl ?? mission.repository.rootPath,
        missionId,
        toolName: 'dependency_acquire',
        metadata: dependencyAuthorizationMetadata(authorization, body),
      })
      authorization = bindDependencyApproval(authorization, decision)
    } catch (error) {
      if (error instanceof ApprovalRequiredError) {
        sendJson(res, 403, {
          error: 'approval_required',
          reasonCode: error.decision.reasonCode,
          message: error.decision.reason,
          approvalRequestId: error.decision.approvalId,
          correlationId: error.decision.correlationId,
        })
        return
      }
      if (error instanceof AuthorizationDeniedError) {
        sendJson(res, 403, {
          error: 'authorization_denied',
          reasonCode: error.decision.reasonCode,
          message: error.decision.reason,
          requiredCapability: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
          approvalPossible: false,
          correlationId: error.decision.correlationId,
        })
        return
      }
      throw error
    }
  }

  const result = await acquireGovernedNpmDependencies({
    workspaceRoot: mission.repository.rootPath,
    runtime,
    authorization,
    request,
  })
  if (context.missionService !== undefined) {
    recordDependencyAcquisitionMissionEvidence(context.missionService, missionId, result)
  }
  sendJson(res, 200, { result: JSON.parse(renderGovernedDependencyAcquisitionResult(result)) })
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
    if (url.pathname === '/api/sandbox/dependencies/npm') {
      await handleDependencyAcquisition(req, res, context)
      return true
    }

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
      let mission: SymbolWrightMission | undefined
      let missionWorkspaceRoot: string | undefined
      let callerKind: 'operator' | 'delegated-grant' | 'team-member' =
        context.callerGrantId === undefined ? 'operator' : 'delegated-grant'
      let effectiveRuntimeMode = context.runtimeMode ?? 'APPROVED_EXECUTION'
      if (missionId !== undefined) {
        const resolved = resolveMissionForExecution(context, missionId)
        if (resolved === undefined) {
          sendJson(res, 404, { error: `Mission not found: ${missionId}` })
          return true
        }
        mission = resolved.mission
        callerKind = resolved.callerKind
        missionWorkspaceRoot = mission.repository.rootPath
        effectiveRuntimeMode = mission.agent.runtimeMode
      }

      const service = context.service
      const securedRecord = bindRepositoryToMissionWorkspace(record, missionWorkspaceRoot)
      await service.refreshInventory()
      const request = service.validateRequest(securedRecord)
      const callerGrant =
        context.callerGrantId === undefined
          ? undefined
          : context.accessRuntime?.grantService.getGrant(context.callerGrantId)
      if (context.callerGrantId !== undefined && callerGrant === undefined) {
        sendJson(res, 403, {
          error: 'authorization_denied',
          reasonCode: 'SANDBOX_GRANT_NOT_FOUND',
          message: 'The delegated sandbox grant no longer exists.',
        })
        return true
      }
      const resolvedReferences =
        callerGrant === undefined ? undefined : resolveGrantSandboxPolicyReferences(callerGrant)
      if (resolvedReferences?.unsupportedReason !== undefined) {
        sendJson(res, 403, {
          error: 'authorization_denied',
          reasonCode: 'SANDBOX_LEGACY_NETWORK_UNSUPPORTED',
          message: resolvedReferences.unsupportedReason,
        })
        return true
      }
      const offlineReference = resolvedReferences?.references.offline
      const approvedCapabilityIds =
        callerGrant !== undefined &&
        (offlineReference === undefined || !grantAllowsOfflineSandbox(callerGrant))
          ? []
          : [SANDBOX_OFFLINE_EXECUTE_CAPABILITY]
      const authorization = {
        deploymentMode: context.deploymentMode ?? 'local',
        callerKind,
        runtimeMode: effectiveRuntimeMode,
        approvedCapabilityIds,
        repositoryId:
          context.repositoryId ??
          mission?.repository.remoteUrl ??
          missionWorkspaceRoot ??
          'inline-source',
        workspaceId: missionId ?? missionWorkspaceRoot ?? 'inline-source',
        ...(missionId === undefined ? {} : { missionId }),
        ...(context.callerPrincipalId === undefined
          ? {}
          : { principalId: context.callerPrincipalId }),
        ...(callerGrant === undefined
          ? {}
          : {
              grantId: callerGrant.id,
              grantVersion: callerGrant.version,
              grantAllowedCommands: callerGrant.executionLimits.allowedCommands,
            }),
        ...(offlineReference === undefined ? {} : { policyReference: offlineReference }),
        intent: 'offline-execution' as const,
      }
      const layer = await networkRuntime(context, missionWorkspaceRoot).dependencyLayers.resolve(
        authorization.workspaceId,
      )
      const result = await runWithSandboxDependencyLayer(layer, () =>
        service.execute(request, {
          mode: effectiveRuntimeMode,
          authorization,
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
        }),
      )
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
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    return true
  }
}
