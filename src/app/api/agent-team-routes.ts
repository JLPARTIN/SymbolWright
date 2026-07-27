import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  ApprovalRequiredError,
  AuthorizationDeniedError,
} from '../../access/authorization-service.js'
import type { AccessRuntime } from '../../access/access-runtime.js'
import { GrantValidationError } from '../../access/access-grant-service.js'
import type {
  AgentProviderKind,
  AgentRole,
  AgentTrustTier,
} from '../../orchestration/orchestration-types.js'
import { AGENT_PROVIDER_KINDS, AGENT_TRUST_TIERS } from '../../orchestration/orchestration-types.js'
import { isBuiltinAgentRole, BUILTIN_ROLE_DEFINITIONS } from '../../orchestration/agent-roles.js'
import type { OrchestrationRuntime } from '../../orchestration/orchestration-runtime.js'
import {
  TeamBudgetExceededError,
  TeamNotFoundError,
  TeamValidationError,
} from '../../orchestration/team-service.js'
import {
  TaskNotFoundError,
  TaskValidationError,
} from '../../orchestration/collaborative-task-service.js'
import {
  CandidateBudgetExceededError,
  CandidateValidationError,
} from '../../orchestration/change-candidate-service.js'
import {
  ReviewValidationError,
  SelfReviewNotPermittedError,
} from '../../orchestration/review-service.js'
import {
  IntegrationNotReadyError,
  IntegrationValidationError,
} from '../../orchestration/integration-engine.js'
import { WorkspaceValidationError } from '../../orchestration/agent-workspace-service.js'
import {
  AGENT_WORKSPACE_MODES,
  type AgentWorkspaceMode,
} from '../../orchestration/agent-workspace-types.js'
import type { RequestPrincipalKind } from './access-routes.js'

export interface AgentTeamRouteContext {
  readonly orchestration: OrchestrationRuntime
  readonly accessRuntime: AccessRuntime
  readonly actor: string
  readonly principalKind: RequestPrincipalKind
  readonly principalId?: string
  readonly grantId?: string
  readonly sessionId?: string
}

const MAX_BODY_BYTES = 256 * 1024

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
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

function str(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function strArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

/**
 * Every `/api/v1/agent-teams/*` handler re-authorizes itself here rather than relying on the
 * generic `route-capability-map.ts` table (which only covers non-`/api/v1/` routes — see
 * `symbolwright-chat-server.ts`'s dispatcher, same convention `access-routes.ts` follows). The
 * local operator (legacy API key) is always authorized; an agent-token principal must hold the
 * exact orchestration capability for the operation, checked fresh on every call so a revoked
 * grant stops working immediately (Section 30/AC23) — never cached from request to request.
 */
async function authorize(
  context: AgentTeamRouteContext,
  capability: string,
  res: ServerResponse,
): Promise<boolean> {
  if (context.principalKind === 'operator') return true
  if (context.principalId === undefined || context.grantId === undefined) {
    sendJson(res, 401, { error: 'unauthorized', message: 'No agent principal on this request.' })
    return false
  }
  try {
    await context.accessRuntime.authorizationService.requireAuthorized({
      principalId: context.principalId,
      grantId: context.grantId,
      ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
      capability,
      toolName: 'agent-team-routes',
    })
    return true
  } catch (error) {
    if (error instanceof ApprovalRequiredError) {
      sendJson(res, 403, {
        error: 'approval_required',
        reasonCode: error.decision.reasonCode,
        message: error.decision.reason,
      })
      return false
    }
    if (error instanceof AuthorizationDeniedError) {
      sendJson(res, 403, {
        error: 'authorization_denied',
        reasonCode: error.decision.reasonCode,
        message: error.decision.reason,
      })
      return false
    }
    throw error
  }
}

function handleKnownError(res: ServerResponse, error: unknown): boolean {
  if (error instanceof TeamNotFoundError || error instanceof TaskNotFoundError) {
    sendJson(res, 404, { error: 'not_found', message: error.message })
    return true
  }
  if (
    error instanceof TeamValidationError ||
    error instanceof TaskValidationError ||
    error instanceof CandidateValidationError ||
    error instanceof ReviewValidationError ||
    error instanceof IntegrationValidationError ||
    error instanceof WorkspaceValidationError ||
    error instanceof GrantValidationError
  ) {
    sendJson(res, 400, { error: 'validation_error', message: error.message })
    return true
  }
  if (error instanceof TeamBudgetExceededError || error instanceof CandidateBudgetExceededError) {
    sendJson(res, 409, { error: 'budget_exceeded', message: error.message })
    return true
  }
  if (error instanceof SelfReviewNotPermittedError) {
    sendJson(res, 403, { error: 'self_review_not_permitted', message: error.message })
    return true
  }
  if (error instanceof IntegrationNotReadyError) {
    sendJson(res, 409, { error: 'integration_not_ready', message: error.message })
    return true
  }
  return false
}

export async function tryHandleAgentTeamRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: AgentTeamRouteContext,
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/v1/agent-teams') && url.pathname !== '/api/v1/agent-roles') {
    return false
  }

  try {
    if (url.pathname === '/api/v1/agent-roles' && req.method === 'GET') {
      sendJson(res, 200, { roles: Object.values(BUILTIN_ROLE_DEFINITIONS) })
      return true
    }

    const segments = url.pathname.split('/').filter(Boolean) // ['api','v1','agent-teams', ...]
    const teamId = segments[3]

    if (url.pathname === '/api/v1/agent-teams' && req.method === 'POST') {
      if (!(await authorize(context, 'orchestration.team.manage', res))) return true
      const body = await readJsonBody(req)
      const missionId = str(body, 'missionId')
      const name = str(body, 'name')
      const objective = str(body, 'objective')
      const repositoryRoot = str(body, 'repositoryRoot')
      if (
        missionId === undefined ||
        name === undefined ||
        objective === undefined ||
        repositoryRoot === undefined
      ) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: 'missionId, name, objective, repositoryRoot are required.',
        })
        return true
      }
      const team = context.orchestration.teamService.createTeam({
        missionId,
        name,
        objective,
        repositoryRoot,
        createdBy: context.actor,
      })
      sendJson(res, 201, { team })
      return true
    }

    if (url.pathname === '/api/v1/agent-teams' && req.method === 'GET') {
      if (!(await authorize(context, 'orchestration.team.read', res))) return true
      sendJson(res, 200, { teams: context.orchestration.teamService.listTeams() })
      return true
    }

    if (teamId === undefined) return true

    if (url.pathname === `/api/v1/agent-teams/${teamId}` && req.method === 'GET') {
      if (!(await authorize(context, 'orchestration.team.read', res))) return true
      const team = context.orchestration.teamService.getTeam(teamId)
      sendJson(res, 200, {
        team,
        members: context.orchestration.store.membersByTeam(teamId),
        tasks: context.orchestration.store.tasksByTeam(teamId),
        candidates: context.orchestration.store.candidatesByTeam(teamId),
      })
      return true
    }

    const lifecycleAction = segments[4]
    if (
      segments.length === 5 &&
      req.method === 'POST' &&
      ['start', 'pause', 'resume', 'cancel'].includes(lifecycleAction ?? '')
    ) {
      if (!(await authorize(context, 'orchestration.team.manage', res))) return true
      const nextStatus =
        lifecycleAction === 'start'
          ? 'running'
          : lifecycleAction === 'pause'
            ? 'paused'
            : lifecycleAction === 'resume'
              ? 'running'
              : 'cancelled'
      const team = context.orchestration.teamService.transition(teamId, nextStatus, context.actor)
      sendJson(res, 200, { team })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/members` && req.method === 'POST') {
      if (!(await authorize(context, 'orchestration.team.manage', res))) return true
      const body = await readJsonBody(req)
      const displayName = str(body, 'displayName')
      const roleRaw = str(body, 'role')
      const provider = str(body, 'provider')
      const trustTier = str(body, 'trustTier')
      const accessProfileId = str(body, 'accessProfileId')
      const principalType = str(body, 'principalType')
      if (
        displayName === undefined ||
        roleRaw === undefined ||
        provider === undefined ||
        trustTier === undefined ||
        accessProfileId === undefined ||
        principalType === undefined
      ) {
        sendJson(res, 400, {
          error: 'validation_error',
          message:
            'displayName, role, provider, trustTier, accessProfileId, principalType are required.',
        })
        return true
      }
      if (!(AGENT_PROVIDER_KINDS as readonly string[]).includes(provider)) {
        sendJson(res, 400, { error: 'validation_error', message: `Unknown provider: ${provider}` })
        return true
      }
      if (!(AGENT_TRUST_TIERS as readonly string[]).includes(trustTier)) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: `Unknown trust tier: ${trustTier}`,
        })
        return true
      }
      if (!isBuiltinAgentRole(roleRaw) && !roleRaw.startsWith('custom:')) {
        sendJson(res, 400, { error: 'validation_error', message: `Unknown role: ${roleRaw}` })
        return true
      }
      const member = context.orchestration.teamService.addMember(teamId, {
        displayName,
        principalType: principalType as
          'human' | 'llm' | 'coding-agent' | 'mcp-client' | 'automation',
        role: roleRaw as AgentRole,
        provider: provider as AgentProviderKind,
        specialization: strArray(body, 'specialization'),
        trustTier: trustTier as AgentTrustTier,
        accessProfileId,
        issuedBy: context.actor,
      })
      sendJson(res, 201, { member })
      return true
    }

    const memberId = segments[5]
    if (
      segments[4] === 'members' &&
      memberId !== undefined &&
      segments.length === 6 &&
      req.method === 'DELETE'
    ) {
      if (!(await authorize(context, 'orchestration.team.manage', res))) return true
      const body = await readJsonBody(req)
      const member = context.orchestration.teamService.removeMember(
        teamId,
        memberId,
        context.actor,
        str(body, 'reason'),
      )
      sendJson(res, 200, { member })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/tasks` && req.method === 'GET') {
      if (!(await authorize(context, 'orchestration.team.read', res))) return true
      sendJson(res, 200, { tasks: context.orchestration.taskService.listTasksForTeam(teamId) })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/tasks` && req.method === 'POST') {
      if (!(await authorize(context, 'orchestration.team.manage', res))) return true
      const body = await readJsonBody(req)
      const title = str(body, 'title')
      const objective = str(body, 'objective')
      const taskType = str(body, 'taskType')
      const executionMode = str(body, 'executionMode')
      const assignmentPolicy = str(body, 'assignmentPolicy')
      if (
        title === undefined ||
        objective === undefined ||
        taskType === undefined ||
        executionMode === undefined ||
        assignmentPolicy === undefined
      ) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: 'title, objective, taskType, executionMode, assignmentPolicy are required.',
        })
        return true
      }
      const team = context.orchestration.teamService.getTeam(teamId)
      const task = context.orchestration.taskService.createTask(
        team.missionId,
        teamId,
        {
          title,
          objective,
          taskType: taskType as never,
          executionMode: executionMode as never,
          assignmentPolicy: assignmentPolicy as never,
          dependencies: strArray(body, 'dependencies'),
          writePaths: strArray(body, 'writePaths'),
          readPaths: strArray(body, 'readPaths'),
          validationCommands: strArray(body, 'validationCommands'),
          acceptanceCriteria: strArray(body, 'acceptanceCriteria'),
        },
        context.actor,
      )
      sendJson(res, 201, { task })
      return true
    }

    const taskId = segments[5]
    if (
      segments[4] === 'tasks' &&
      taskId !== undefined &&
      segments[6] === 'assign' &&
      req.method === 'POST'
    ) {
      if (!(await authorize(context, 'orchestration.task.assign', res))) return true
      const decision = context.orchestration.assignmentEngine.assign(teamId, taskId)
      if (!decision.unresolved) {
        context.orchestration.taskService.assignAgents(taskId, decision.selectedAgentIds)
      }
      sendJson(res, 200, { decision })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/workspaces` && req.method === 'POST') {
      if (!(await authorize(context, 'orchestration.candidate.submit', res))) return true
      const body = await readJsonBody(req)
      const workspaceTaskId = str(body, 'taskId')
      const agentId = str(body, 'agentId')
      if (workspaceTaskId === undefined || agentId === undefined) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: 'taskId and agentId are required.',
        })
        return true
      }
      const requestedMode = str(body, 'mode')
      if (
        requestedMode !== undefined &&
        !(AGENT_WORKSPACE_MODES as readonly string[]).includes(requestedMode)
      ) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: `Unknown workspace mode: ${requestedMode}`,
        })
        return true
      }
      const team = context.orchestration.teamService.getTeam(teamId)
      const workspace = await context.orchestration.workspaceService.createWorkspace({
        teamId,
        taskId: workspaceTaskId,
        agentId,
        repositoryRoot: team.repositoryRoot,
        mode: (requestedMode as AgentWorkspaceMode | undefined) ?? 'worktree',
        allowedWritePaths: strArray(body, 'allowedWritePaths'),
        allowedReadPaths: strArray(body, 'allowedReadPaths'),
      })
      sendJson(res, 201, { workspace })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/candidates` && req.method === 'GET') {
      if (!(await authorize(context, 'orchestration.team.read', res))) return true
      sendJson(res, 200, { candidates: context.orchestration.candidateService.listForTeam(teamId) })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/candidates` && req.method === 'POST') {
      if (!(await authorize(context, 'orchestration.candidate.submit', res))) return true
      const body = await readJsonBody(req)
      const taskId2 = str(body, 'taskId')
      const agentId = str(body, 'agentId')
      const workspaceId = str(body, 'workspaceId')
      const rationale = str(body, 'rationale')
      if (
        taskId2 === undefined ||
        agentId === undefined ||
        workspaceId === undefined ||
        rationale === undefined
      ) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: 'taskId, agentId, workspaceId, rationale are required.',
        })
        return true
      }
      const team = context.orchestration.teamService.getTeam(teamId)
      const workspace = context.orchestration.workspaceService.getWorkspace(workspaceId)
      const candidate = await context.orchestration.candidateService.submitCandidate({
        missionId: team.missionId,
        teamId,
        taskId: taskId2,
        agentId,
        workspace,
        rationale,
        maxCandidatesForTask: team.budget.maxCandidateImplementationsPerTask,
      })
      context.orchestration.taskService.recordCandidate(taskId2, candidate.id)
      sendJson(res, 201, { candidate })
      return true
    }

    const candidateId = segments[5]
    if (
      segments[4] === 'candidates' &&
      candidateId !== undefined &&
      segments[6] === 'review' &&
      req.method === 'POST'
    ) {
      if (!(await authorize(context, 'orchestration.review.submit', res))) return true
      const body = await readJsonBody(req)
      const reviewerId = str(body, 'reviewerId') ?? context.actor
      const verdict = str(body, 'verdict')
      const rationale = str(body, 'rationale')
      if (verdict === undefined || rationale === undefined) {
        sendJson(res, 400, {
          error: 'validation_error',
          message: 'verdict and rationale are required.',
        })
        return true
      }
      const findingsRaw = Array.isArray(body['findings']) ? (body['findings'] as unknown[]) : []
      const findings = findingsRaw
        .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .map((f) => ({
          severity: str(f, 'severity') as never,
          summary: str(f, 'summary') ?? '',
          ...(str(f, 'filePath') === undefined ? {} : { filePath: str(f, 'filePath') as string }),
        }))
      const review = context.orchestration.reviewService.submitReview({
        candidateId,
        teamId,
        reviewerId,
        findings,
        verdict: verdict as never,
        rationale,
      })
      sendJson(res, 201, { review })
      return true
    }

    if (
      segments[4] === 'candidates' &&
      candidateId !== undefined &&
      (segments[6] === 'accept' || segments[6] === 'reject') &&
      req.method === 'POST'
    ) {
      if (!(await authorize(context, 'orchestration.review.submit', res))) return true
      const body = await readJsonBody(req)
      const rationale = str(body, 'rationale') ?? ''
      if (
        segments[6] === 'accept' &&
        !context.orchestration.reviewService.hasIndependentApproval(candidateId)
      ) {
        sendJson(res, 409, {
          error: 'review_required',
          message:
            'Candidate requires at least one independent approval with no open blocking findings before acceptance.',
        })
        return true
      }
      const candidate = context.orchestration.candidateService.decide(
        candidateId,
        segments[6] === 'accept' ? 'approved' : 'rejected',
        context.actor,
        rationale,
      )
      sendJson(res, 200, { candidate })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/integrations` && req.method === 'POST') {
      if (!(await authorize(context, 'orchestration.integration.request', res))) return true
      const body = await readJsonBody(req)
      const candidateIds = strArray(body, 'candidateIds')
      const plan = await context.orchestration.integrationService.prepareIntegration(
        teamId,
        candidateIds,
      )
      sendJson(res, 201, { plan })
      return true
    }

    const integrationId = segments[5]
    if (
      segments[4] === 'integrations' &&
      integrationId !== undefined &&
      segments[6] === 'execute' &&
      req.method === 'POST'
    ) {
      if (!(await authorize(context, 'orchestration.integration.request', res))) return true
      const result =
        await context.orchestration.integrationService.executeIntegration(integrationId)
      sendJson(res, 200, { result })
      return true
    }

    if (
      segments[4] === 'integrations' &&
      integrationId !== undefined &&
      segments[6] === 'rollback' &&
      req.method === 'POST'
    ) {
      if (!(await authorize(context, 'orchestration.integration.request', res))) return true
      const body = await readJsonBody(req)
      const result = await context.orchestration.integrationService.rollbackIntegration(
        integrationId,
        str(body, 'reason') ?? 'Operator-requested rollback.',
      )
      sendJson(res, 200, { result })
      return true
    }

    if (url.pathname === `/api/v1/agent-teams/${teamId}/events` && req.method === 'GET') {
      if (!(await authorize(context, 'orchestration.team.read', res))) return true
      const events = context.orchestration.store
        .listAudit()
        .filter((event) => event.teamId === teamId)
      sendJson(res, 200, { events })
      return true
    }

    sendJson(res, 404, {
      error: 'not_found',
      message: `No such agent-team route: ${req.method} ${url.pathname}`,
    })
    return true
  } catch (error) {
    if (handleKnownError(res, error)) return true
    throw error
  }
}
