import type { IncomingMessage, ServerResponse } from 'node:http'

import type { AccessRuntime } from '../../access/access-runtime.js'
import {
  DeviceAuthorizationNotFoundError,
  DeviceAuthorizationStateError,
} from '../../access/device-authorization-service.js'
import {
  GrantNotFoundError,
  GrantValidationError,
  StepUpRequiredError,
  type CreateGrantInput,
} from '../../access/access-grant-service.js'
import { ApprovalNotFoundError, ApprovalStateError } from '../../access/authorization-service.js'
import { ALL_CAPABILITIES } from '../../access/access-capability-catalog.js'
import { PERMISSION_PROFILES } from '../../access/access-profiles.js'
import { APPROVAL_REQUIREMENTS } from '../../access/access-types.js'
import type {
  ApprovalPolicy,
  BranchScope,
  ClientConstraints,
  MissionExecutionLimits,
  RepositoryScope,
  SessionLimits,
} from '../../access/access-types.js'

export type RequestPrincipalKind = 'operator' | 'agent'

export interface AccessRouteContext {
  readonly runtime: AccessRuntime
  /** The identity performing this HTTP call — the legacy operator, or an agent-token session. */
  readonly actor: string
  readonly principalKind: RequestPrincipalKind
}

const MAX_BODY_BYTES = 256 * 1024

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sendDenied(res: ServerResponse, message: string): void {
  sendJson(res, 403, {
    error: 'authorization_denied',
    reasonCode: 'OPERATOR_ONLY_ROUTE',
    message,
  })
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    totalBytes += buffer.length
    if (totalBytes > MAX_BODY_BYTES) throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

function requireOperator(context: AccessRouteContext, res: ServerResponse): boolean {
  if (context.principalKind !== 'operator') {
    sendDenied(res, 'Only the local operator may manage delegated agent access grants.')
    return false
  }
  return true
}

function parseRepositoryScope(value: unknown): RepositoryScope {
  const record = (value ?? {}) as Record<string, unknown>
  const mode = typeof record['mode'] === 'string' ? record['mode'] : 'single'
  const repositories = Array.isArray(record['repositories'])
    ? record['repositories'].filter((entry): entry is string => typeof entry === 'string')
    : []
  const organizations = Array.isArray(record['organizations'])
    ? record['organizations'].filter((entry): entry is string => typeof entry === 'string')
    : []
  return {
    mode: mode as RepositoryScope['mode'],
    repositories,
    organizations,
  }
}

function parseBranchScopeOverride(value: unknown): Partial<BranchScope> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const result: Partial<BranchScope> = {}
  if (Array.isArray(record['allowedPatterns'])) {
    Object.assign(result, {
      allowedPatterns: record['allowedPatterns'].filter(
        (entry): entry is string => typeof entry === 'string',
      ),
    })
  }
  if (Array.isArray(record['deniedPatterns'])) {
    Object.assign(result, {
      deniedPatterns: record['deniedPatterns'].filter(
        (entry): entry is string => typeof entry === 'string',
      ),
    })
  }
  if (typeof record['defaultBranchMutationAllowed'] === 'boolean') {
    Object.assign(result, {
      defaultBranchMutationAllowed: record['defaultBranchMutationAllowed'],
    })
  }
  return result
}

function optionalPositiveNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new GrantValidationError(`${key} must be a positive number.`)
  }
  return value
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new GrantValidationError(`${key} must be a boolean.`)
  return value
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new GrantValidationError(`${key} must be an array of strings.`)
  }
  return value
}

function parseMissionExecutionLimits(value: unknown): MissionExecutionLimits | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new GrantValidationError('executionLimits must be an object.')
  }
  const record = value as Record<string, unknown>
  const maxConcurrentMissions = optionalPositiveNumber(record, 'maxConcurrentMissions')
  const maxMissionDurationMinutes = optionalPositiveNumber(record, 'maxMissionDurationMinutes')
  const maxRepairAttempts = optionalPositiveNumber(record, 'maxRepairAttempts')
  const sandboxNetworkAccess = optionalBoolean(record, 'sandboxNetworkAccess')
  const allowedCommands = optionalStringArray(record, 'allowedCommands')
  const maxFilesChanged = optionalPositiveNumber(record, 'maxFilesChanged')
  const maxDiffLines = optionalPositiveNumber(record, 'maxDiffLines')
  const maxCommits = optionalPositiveNumber(record, 'maxCommits')
  const requirePullRequest = optionalBoolean(record, 'requirePullRequest')
  const allowDirectPush = optionalBoolean(record, 'allowDirectPush')
  return {
    ...(maxConcurrentMissions === undefined ? {} : { maxConcurrentMissions }),
    ...(maxMissionDurationMinutes === undefined ? {} : { maxMissionDurationMinutes }),
    ...(maxRepairAttempts === undefined ? {} : { maxRepairAttempts }),
    ...(sandboxNetworkAccess === undefined ? {} : { sandboxNetworkAccess }),
    ...(allowedCommands === undefined ? {} : { allowedCommands }),
    ...(maxFilesChanged === undefined ? {} : { maxFilesChanged }),
    ...(maxDiffLines === undefined ? {} : { maxDiffLines }),
    ...(maxCommits === undefined ? {} : { maxCommits }),
    ...(requirePullRequest === undefined ? {} : { requirePullRequest }),
    ...(allowDirectPush === undefined ? {} : { allowDirectPush }),
  }
}

function parseSessionLimits(value: unknown): SessionLimits | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new GrantValidationError('sessionLimits must be an object.')
  }
  const record = value as Record<string, unknown>
  const maxConcurrentSessions = optionalPositiveNumber(record, 'maxConcurrentSessions')
  const maxSessionDurationMinutes = optionalPositiveNumber(record, 'maxSessionDurationMinutes')
  const inactivityTimeoutMinutes = optionalPositiveNumber(record, 'inactivityTimeoutMinutes')
  const singleUse = optionalBoolean(record, 'singleUse')
  return {
    ...(maxConcurrentSessions === undefined ? {} : { maxConcurrentSessions }),
    ...(maxSessionDurationMinutes === undefined ? {} : { maxSessionDurationMinutes }),
    ...(inactivityTimeoutMinutes === undefined ? {} : { inactivityTimeoutMinutes }),
    ...(singleUse === undefined ? {} : { singleUse }),
  }
}

function parseClientConstraints(value: unknown): ClientConstraints | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new GrantValidationError('clientConstraints must be an object.')
  }
  const record = value as Record<string, unknown>
  const allowedIpCidrs = optionalStringArray(record, 'allowedIpCidrs')
  const allowedClientIds = optionalStringArray(record, 'allowedClientIds')
  return {
    ...(allowedIpCidrs === undefined ? {} : { allowedIpCidrs }),
    ...(allowedClientIds === undefined ? {} : { allowedClientIds }),
  }
}

function parseApprovalPolicy(value: unknown): ApprovalPolicy | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as Record<string, unknown>)['rules'])
  ) {
    throw new GrantValidationError('approvalPolicy must be an object with a "rules" array.')
  }
  const rules = (value as Record<string, unknown>)['rules'] as unknown[]
  return {
    rules: rules.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new GrantValidationError(`approvalPolicy.rules[${index}] must be an object.`)
      }
      const rule = entry as Record<string, unknown>
      const match = rule['match']
      const requirement = rule['requirement']
      if (typeof match !== 'string' || match.length === 0) {
        throw new GrantValidationError(
          `approvalPolicy.rules[${index}].match must be a non-empty string.`,
        )
      }
      if (
        typeof requirement !== 'string' ||
        !(APPROVAL_REQUIREMENTS as readonly string[]).includes(requirement)
      ) {
        throw new GrantValidationError(
          `approvalPolicy.rules[${index}].requirement must be one of: ${APPROVAL_REQUIREMENTS.join(', ')}`,
        )
      }
      return { match, requirement: requirement as ApprovalPolicy['rules'][number]['requirement'] }
    }),
  }
}

function redactGrantForResponse(runtime: AccessRuntime, grantId: string): Record<string, unknown> {
  const grant = runtime.grantService.getGrant(grantId)
  if (grant === undefined) return {}
  const credentials = runtime.store.listCredentialsForGrant(grantId).map((entry) => ({
    id: entry.id,
    revoked: entry.revoked,
    lastFour: entry.metadata.lastFour,
    kind: entry.metadata.kind,
    createdAt: entry.metadata.createdAt,
    lastUsedAt: entry.metadata.lastUsedAt,
  }))
  const pendingApprovals = runtime.store
    .listApprovalsForGrant(grantId)
    .filter((entry) => entry.status === 'pending')
  return { grant, credentials, pendingApprovals }
}

export async function handleAccessRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: AccessRouteContext,
): Promise<boolean> {
  const { runtime } = context

  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/permissions/catalog') {
      sendJson(res, 200, { capabilities: ALL_CAPABILITIES })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/permissions/profiles') {
      sendJson(res, 200, { profiles: PERMISSION_PROFILES })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/access-grants') {
      if (!requireOperator(context, res)) return true
      const body = await readJsonBody(req)
      const branchScope = parseBranchScopeOverride(body['branchScope'])
      const executionLimits = parseMissionExecutionLimits(body['executionLimits'])
      const sessionLimits = parseSessionLimits(body['sessionLimits'])
      const clientConstraints = parseClientConstraints(body['clientConstraints'])
      const approvalPolicy = parseApprovalPolicy(body['approvalPolicy'])
      const input: CreateGrantInput = {
        principalType: body['principalType'] as CreateGrantInput['principalType'],
        displayName: String(body['displayName'] ?? ''),
        issuedBy: context.actor,
        profileId: String(body['profileId'] ?? ''),
        repositoryScope: parseRepositoryScope(body['repositoryScope']),
        ...(branchScope === undefined ? {} : { branchScope }),
        ...(Array.isArray(body['additionalSymbolWrightCapabilities'])
          ? {
              additionalSymbolWrightCapabilities: body[
                'additionalSymbolWrightCapabilities'
              ] as readonly string[],
            }
          : {}),
        ...(Array.isArray(body['additionalGithubCapabilities'])
          ? {
              additionalGithubCapabilities: body[
                'additionalGithubCapabilities'
              ] as readonly string[],
            }
          : {}),
        ...(Array.isArray(body['explicitHighRiskCapabilities'])
          ? {
              explicitHighRiskCapabilities: body[
                'explicitHighRiskCapabilities'
              ] as readonly string[],
            }
          : {}),
        ...(Array.isArray(body['deniedCapabilities'])
          ? { deniedCapabilities: body['deniedCapabilities'] as readonly string[] }
          : {}),
        ...(typeof body['expiresInHours'] === 'number'
          ? { expiresInHours: body['expiresInHours'] }
          : {}),
        ...(typeof body['reason'] === 'string' ? { reason: body['reason'] } : {}),
        ...(typeof body['stepUpConfirmed'] === 'boolean'
          ? { stepUpConfirmed: body['stepUpConfirmed'] }
          : {}),
        ...(typeof body['enableMerge'] === 'boolean' ? { enableMerge: body['enableMerge'] } : {}),
        ...(executionLimits === undefined ? {} : { executionLimits }),
        ...(sessionLimits === undefined ? {} : { sessionLimits }),
        ...(clientConstraints === undefined ? {} : { clientConstraints }),
        ...(approvalPolicy === undefined ? {} : { approvalPolicy }),
      }
      const created = runtime.grantService.createGrant(input)
      sendJson(res, 201, created)
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/access-grants') {
      if (!requireOperator(context, res)) return true
      sendJson(res, 200, { grants: runtime.grantService.listGrants() })
      return true
    }

    const grantIdMatch = url.pathname.match(/^\/api\/v1\/access-grants\/([^/]+)(?:\/(.+))?$/)
    if (grantIdMatch !== null) {
      const grantId = grantIdMatch[1] as string
      const action = grantIdMatch[2]

      if (req.method === 'GET' && action === undefined) {
        if (!requireOperator(context, res)) return true
        const detail = redactGrantForResponse(runtime, grantId)
        if (Object.keys(detail).length === 0) {
          sendJson(res, 404, { error: 'not_found', message: `Grant not found: ${grantId}` })
          return true
        }
        sendJson(res, 200, detail)
        return true
      }

      if (req.method === 'DELETE' && action === undefined) {
        if (!requireOperator(context, res)) return true
        runtime.grantService.deleteGrant(grantId)
        sendJson(res, 200, { ok: true })
        return true
      }

      if (req.method === 'PATCH' && action === undefined) {
        if (!requireOperator(context, res)) return true
        const body = await readJsonBody(req)
        const executionLimits = parseMissionExecutionLimits(body['executionLimits'])
        const sessionLimits = parseSessionLimits(body['sessionLimits'])
        const clientConstraints = parseClientConstraints(body['clientConstraints'])
        const grant = runtime.grantService.narrowGrant(grantId, {
          ...(typeof body['displayName'] === 'string' ? { displayName: body['displayName'] } : {}),
          ...(typeof body['reason'] === 'string' ? { reason: body['reason'] } : {}),
          ...(Array.isArray(body['additionalDeniedCapabilities'])
            ? {
                additionalDeniedCapabilities: body[
                  'additionalDeniedCapabilities'
                ] as readonly string[],
              }
            : {}),
          ...(typeof body['expiresAt'] === 'string' ? { expiresAt: body['expiresAt'] } : {}),
          ...(executionLimits === undefined ? {} : { executionLimits }),
          ...(sessionLimits === undefined ? {} : { sessionLimits }),
          ...(clientConstraints === undefined ? {} : { clientConstraints }),
        })
        sendJson(res, 200, { grant })
        return true
      }

      if (req.method === 'POST' && action === 'pause') {
        if (!requireOperator(context, res)) return true
        sendJson(res, 200, { grant: runtime.grantService.pauseGrant(grantId, context.actor) })
        return true
      }

      if (req.method === 'POST' && action === 'resume') {
        if (!requireOperator(context, res)) return true
        sendJson(res, 200, { grant: runtime.grantService.resumeGrant(grantId, context.actor) })
        return true
      }

      if (req.method === 'POST' && action === 'revoke') {
        if (!requireOperator(context, res)) return true
        const body = await readJsonBody(req)
        const reason = typeof body['reason'] === 'string' ? body['reason'] : undefined
        sendJson(res, 200, {
          grant: runtime.grantService.revokeGrant(grantId, context.actor, reason),
        })
        return true
      }

      if (req.method === 'POST' && action === 'rotate') {
        if (!requireOperator(context, res)) return true
        sendJson(res, 200, runtime.grantService.rotateCredential(grantId))
        return true
      }

      const approvalMatch = action?.match(/^approvals\/([^/]+)\/(approve|deny)$/)
      if (req.method === 'POST' && approvalMatch !== null && approvalMatch !== undefined) {
        if (!requireOperator(context, res)) return true
        const approvalId = approvalMatch[1] as string
        const outcome = approvalMatch[2] === 'approve' ? 'approved' : 'denied'
        const body = await readJsonBody(req)
        const comment = typeof body['comment'] === 'string' ? body['comment'] : undefined
        const approval = runtime.authorizationService.decideApproval(
          grantId,
          approvalId,
          outcome,
          context.actor,
          comment,
        )
        sendJson(res, 200, { approval })
        return true
      }

      if (req.method === 'GET' && action === 'approvals') {
        if (!requireOperator(context, res)) return true
        sendJson(res, 200, {
          approvals: runtime.authorizationService.listApprovalsForGrant(grantId),
        })
        return true
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/device-authorization/approve') {
      if (!requireOperator(context, res)) return true
      const body = await readJsonBody(req)
      const userCode = String(body['userCode'] ?? '')
      sendJson(res, 200, {
        deviceAuthorization: runtime.deviceAuthorizationService.approve(userCode, context.actor),
      })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/device-authorization/deny') {
      if (!requireOperator(context, res)) return true
      const body = await readJsonBody(req)
      const userCode = String(body['userCode'] ?? '')
      sendJson(res, 200, {
        deviceAuthorization: runtime.deviceAuthorizationService.deny(userCode, context.actor),
      })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/device-authorization/pending') {
      if (!requireOperator(context, res)) return true
      sendJson(res, 200, { pending: runtime.deviceAuthorizationService.listPending() })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/audit/agent-access') {
      if (!requireOperator(context, res)) return true
      const grantId = url.searchParams.get('grantId') ?? undefined
      const limitParam = url.searchParams.get('limit')
      const limit = limitParam !== null ? Number.parseInt(limitParam, 10) : undefined
      sendJson(res, 200, {
        events: runtime.store.listAuditEvents({
          ...(grantId === undefined ? {} : { grantId }),
          ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
        }),
      })
      return true
    }

    return false
  } catch (error) {
    if (error instanceof GrantNotFoundError) {
      sendJson(res, 404, { error: 'not_found', message: error.message })
      return true
    }
    if (error instanceof StepUpRequiredError) {
      sendJson(res, 400, { error: 'step_up_required', message: error.message })
      return true
    }
    if (error instanceof GrantValidationError) {
      sendJson(res, 400, { error: 'validation_error', message: error.message })
      return true
    }
    if (error instanceof ApprovalNotFoundError) {
      sendJson(res, 404, { error: 'not_found', message: error.message })
      return true
    }
    if (error instanceof ApprovalStateError) {
      sendJson(res, 400, { error: 'approval_state_error', message: error.message })
      return true
    }
    if (
      error instanceof DeviceAuthorizationNotFoundError ||
      error instanceof DeviceAuthorizationStateError
    ) {
      sendJson(res, 400, { error: 'device_authorization_error', message: error.message })
      return true
    }
    throw error
  }
}

/**
 * The OAuth-device-flow request/poll endpoints are deliberately unauthenticated by the same
 * Bearer-token gate every other `/api/*` route requires — that gate is exactly what an agent
 * that has not yet been granted access cannot present. Security instead comes from: a short
 * device-code TTL, a human operator explicitly approving via `userCode` in the authenticated
 * `/approve` route above, and the token being delivered at most once per approval.
 */
export async function handleUnauthenticatedDeviceFlowRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  runtime: AccessRuntime,
): Promise<boolean> {
  if (req.method === 'POST' && url.pathname === '/api/v1/device-authorization') {
    const body = await readJsonBody(req)
    const principalType = body['principalType']
    const validPrincipalType =
      typeof principalType === 'string' &&
      [
        'human',
        'llm',
        'coding-agent',
        'mcp-client',
        'automation',
        'ci',
        'service-account',
      ].includes(principalType)
    if (!validPrincipalType) {
      sendJson(res, 400, { error: 'validation_error', message: 'principalType is required' })
      return true
    }
    const profileId =
      typeof body['requestedProfileId'] === 'string' ? body['requestedProfileId'] : 'coding-agent'
    const response = runtime.deviceAuthorizationService.requestDeviceAuthorization({
      principalType: principalType as never,
      displayName: String(body['displayName'] ?? 'Unnamed agent'),
      requestedProfileId: profileId,
      requestedRepositoryScope: parseRepositoryScope(body['requestedRepositoryScope']),
      ...(typeof body['clientId'] === 'string' ? { clientId: body['clientId'] } : {}),
    })
    sendJson(res, 200, response)
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/oauth/token') {
    const body = await readJsonBody(req)
    const deviceCode = String(body['device_code'] ?? '')
    if (deviceCode.length === 0) {
      sendJson(res, 400, { error: 'invalid_request', error_description: 'device_code is required' })
      return true
    }
    const result = runtime.deviceAuthorizationService.poll(deviceCode)
    if (result.status === 'ok') {
      sendJson(res, 200, {
        access_token: result.token,
        token_type: 'bearer',
        grant_id: result.grantId,
      })
      return true
    }
    sendJson(res, 400, { error: result.status })
    return true
  }

  return false
}
