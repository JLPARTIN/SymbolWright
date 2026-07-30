import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  AuthorizationDeniedError,
  ApprovalRequiredError,
} from '../../access/authorization-service.js'
import { SANDBOX_EGRESS_CAPABILITY } from '../../access/sandbox-capabilities.js'
import {
  grantAllowsEgress,
  resolveGrantSandboxPolicyReferences,
} from '../../access/sandbox-policy-compat.js'
import { canAccessMission, resolveMissionVisibility } from '../../access/mission-access-guard.js'
import {
  bindEgressApproval,
  buildEgressAuthorization,
  egressAuthorizationMetadata,
} from '../../sandbox/egress-authorization.js'
import { recordEgressMissionEvidence } from '../../sandbox/egress-mission-evidence.js'
import {
  parseGovernedEgressRequest,
  renderGovernedEgressResult,
  requestGovernedEgress,
} from '../../sandbox/governed-egress.js'
import { getOrCreateApplicationSandboxNetworkRuntime } from '../../sandbox/sandbox-network-runtime.js'
import { SandboxRequestValidationError } from '../../sandbox/sandbox-request.js'
import type { SandboxRouteContext } from './sandbox-routes.js'

const MAX_EGRESS_REQUEST_BYTES = 2 * 1024 * 1024

export async function handleSandboxEgressRoute(
  req: IncomingMessage,
  res: ServerResponse,
  context: SandboxRouteContext,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }
  const body = asRecord(await readJsonBody(req))
  const missionId = requiredMissionId(body)
  if (context.missionService === undefined) {
    throw new SandboxRequestValidationError(
      'missionId cannot be resolved because no mission service is configured',
    )
  }
  let mission
  try {
    mission = context.missionService.get(missionId)
  } catch {
    sendJson(res, 404, { error: `Mission not found: ${missionId}` })
    return
  }
  const visibility = resolveMissionVisibility(context.callerGrantId, context.teamSource)
  const access = canAccessMission(mission, visibility, 'execute')
  if (!access.allowed) {
    sendJson(res, 404, { error: `Mission not found: ${missionId}` })
    return
  }
  const callerKind =
    access.relationship === 'team_member' || access.relationship === 'team_owner'
      ? 'team-member'
      : context.callerGrantId === undefined
        ? 'operator'
        : 'delegated-grant'
  const runtime = getOrCreateApplicationSandboxNetworkRuntime({
    workspaceRoot: mission.repository.rootPath,
  })
  const callerGrant =
    context.callerGrantId === undefined
      ? undefined
      : context.accessRuntime?.grantService.getGrant(context.callerGrantId)
  if (context.callerGrantId !== undefined && callerGrant === undefined) {
    sendJson(res, 403, {
      error: 'authorization_denied',
      reasonCode: 'EGRESS_GRANT_NOT_FOUND',
      message: 'The delegated egress grant no longer exists.',
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
    callerGrant === undefined ? runtime.defaultEgressPolicyReference : references?.references.egress
  if (policyReference === undefined) {
    sendJson(res, 403, {
      error: 'authorization_denied',
      reasonCode: 'EGRESS_POLICY_REFERENCE_REQUIRED',
      message: 'No operator-owned egress policy is bound to this caller.',
    })
    return
  }
  const requestRecord = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'missionId'),
  )
  let request
  try {
    request = parseGovernedEgressRequest(requestRecord)
  } catch (error) {
    throw new SandboxRequestValidationError(error instanceof Error ? error.message : String(error))
  }
  let authorization = buildEgressAuthorization({
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
          capabilityApproved: grantAllowsEgress(callerGrant),
        }),
  })

  if (callerGrant !== undefined && context.accessRuntime !== undefined) {
    try {
      const decision = await context.accessRuntime.authorizationService.requireAuthorized({
        principalId: callerGrant.principalId,
        grantId: callerGrant.id,
        capability: SANDBOX_EGRESS_CAPABILITY,
        repository: mission.repository.remoteUrl ?? mission.repository.rootPath,
        missionId,
        toolName: 'sandbox_egress_request',
        metadata: egressAuthorizationMetadata(authorization, requestRecord),
      })
      authorization = bindEgressApproval(authorization, decision)
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
          requiredCapability: SANDBOX_EGRESS_CAPABILITY,
          approvalPossible: false,
          correlationId: error.decision.correlationId,
        })
        return
      }
      throw error
    }
  }

  const result = await requestGovernedEgress({ runtime, authorization, request })
  recordEgressMissionEvidence(context.missionService, missionId, result)
  sendJson(res, result.status === 'completed' ? 200 : 403, {
    result: JSON.parse(renderGovernedEgressResult(result)),
  })
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
    if (totalBytes > MAX_EGRESS_REQUEST_BYTES) {
      throw new SandboxRequestValidationError(
        `Request body exceeds ${MAX_EGRESS_REQUEST_BYTES} bytes`,
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
    throw new SandboxRequestValidationError('Sandbox egress request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function requiredMissionId(record: Record<string, unknown>): string {
  const value = record['missionId']
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SandboxRequestValidationError('missionId is required for governed egress')
  }
  return value
}
