import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import { createAndStartHttpServer, ShutdownLifecycle } from '../app/server/http-bootstrap.js'
import {
  SYMBOLWRIGHT_PROVIDER_ADAPTERS,
  SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS,
  type SymbolWrightProviderId,
} from '../providers/provider-adapter-contract.js'
import { loadProviderGatewayConfig, type ProviderGatewayEnv } from '../providers/provider-config.js'
import { ProviderGateway } from '../providers/provider-gateway.js'
import { normalizeProviderGatewayError } from '../providers/provider-errors.js'
import type {
  ProviderGatewayResponse,
  ProviderHttpTransport,
} from '../providers/provider-gateway.types.js'
import {
  applyProviderRuntimeOverrides,
  ProviderRuntimeOverrideStore,
  ProviderRuntimeOverrideValidationError,
} from '../providers/provider-runtime-overrides.js'
import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopConfig, AgentLoopEvent, AgentLoopResult } from '../agent/agent-loop.types.js'
import { getCheckpoint, listCheckpoints } from '../checkpoint/checkpoint-service.js'
import { AccessRuntime } from '../access/access-runtime.js'
import {
  ClientConstraintViolationError,
  InvalidCredentialError,
  SessionInactivityTimeoutError,
  SessionLimitExceededError,
} from '../access/access-grant-service.js'
import { AuthorizationDeniedError, ApprovalRequiredError } from '../access/authorization-service.js'
import { resolveRouteCapability } from '../access/route-capability-map.js'
import {
  canAccessMission,
  resolveMissionVisibility,
  type TeamVisibilitySource,
} from '../access/mission-access-guard.js'
import { checkConcurrentMissionLimit } from '../access/mission-concurrency-guard.js'
import {
  BRANCH_SENSITIVE_ROUTE_CAPABILITIES,
  isLikelyDefaultBranch,
  resolveCurrentGitBranch,
} from '../access/git-branch-resolver.js'
import {
  handleAccessRoute,
  handleUnauthenticatedDeviceFlowRoute,
  type RequestPrincipalKind,
} from '../app/api/access-routes.js'
import { handleMissionRoute } from '../app/api/mission-routes.js'
import { tryHandleAgentTeamRoute } from '../app/api/agent-team-routes.js'
import { OrchestrationRuntime } from '../orchestration/orchestration-runtime.js'
import { handleGitHubIntakeRoute } from '../app/api/github-intake-routes.js'
import {
  handleCheckpointDetail,
  handleCheckpointsList,
  handleMemoryProcedural,
  handleMemoryRecent,
  handleToolsRegistry,
} from '../app/api/readonly-registry-routes.js'
import {
  detectGitHubRepository,
  handleRepositoryBranchCreate,
  handleRepositoryBranches,
  handleRepositoryCheckpointRestore,
  handleRepositoryCommit,
  handleRepositoryDiff,
  handleRepositoryFileRead,
  handleRepositoryFileWrite,
  handleRepositoryPullRequestCreate,
  handleRepositoryPush,
  handleRepositoryStatus,
  handleRepositoryTree,
} from '../app/api/repository-routes.js'
import { handleSandboxRoute } from '../app/api/sandbox-routes.js'
import { MissionNotFoundError, MissionService } from '../mission/mission-service.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import type { GitHubPrCreationClient } from '../runtime/github-write/github-pr-creation.js'
import { loadGitHubAppConfigFromEnv } from '../github/github-app-auth.js'
import {
  createGitHubTokenResolver,
  type GitHubTokenResolver,
} from '../github/github-token-resolver.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { SandboxHistoryStore } from '../sandbox/sandbox-history.js'
import { SandboxService } from '../sandbox/sandbox-service.js'
import { collectStatus } from '../web/status-runner.js'
import type { RuntimeStatusView } from '../web/status.js'
import {
  AgentProviderMissingCredentialsError,
  resolveAgentLlmProvider,
} from './symbolwright-agent-provider.js'
import { parseAgentRequestBody } from './symbolwright-agent-request.js'
import {
  ChatRequestValidationError,
  parseChatRequestBody,
  parseRegisterRequestBody,
  parseResetRequestBody,
} from './symbolwright-chat-request.js'
import {
  FetchProviderStreamTransport,
  streamProviderChat,
  supportsRealtimeStreaming,
  type ProviderStreamTransport,
} from './provider-chat-stream.js'
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limiter.js'

const DEFAULT_AGENT_SYSTEM_PROMPT =
  'You are SymbolWright, a direct-capable coding agent. Use the available tools to accomplish the request.'

const MAX_BODY_BYTES = 256 * 1024
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60
const DEFAULT_DEVICE_FLOW_RATE_LIMIT_PER_MINUTE = 20

export class ChatServerConfigError extends Error {}

export interface ChatServerOptions {
  readonly apiKey: string
  readonly host: string
  readonly port: number
  readonly corsOrigin?: string
  readonly tlsCertFile?: string
  readonly tlsKeyFile?: string
  readonly env?: ProviderGatewayEnv
  readonly overrideStore?: ProviderRuntimeOverrideStore
  readonly transport?: ProviderHttpTransport
  readonly streamTransport?: ProviderStreamTransport
  readonly rateLimiter?: RateLimiter
  /** Rate limiter applied to the unauthenticated `/api/v1/device-authorization` and
   * `/api/v1/oauth/token` routes, keyed by IP. Separate from `rateLimiter` because those routes
   * run ahead of the Bearer-token gate and would otherwise never hit any limiter at all. */
  readonly deviceFlowRateLimiter?: RateLimiter
  readonly localStatusProvider?: () => Promise<RuntimeStatusView>
  readonly cwd?: string
  /** Test seam for deterministic mission storage/lifecycle behavior. */
  readonly missionService?: MissionService
  /** Test seam: inject a fake GitHubPrCreationClient for the Repository PR-creation route instead of constructing the real REST client. */
  readonly githubPrCreationClient?: GitHubPrCreationClient
  /** Test seam for deterministic delegated-agent-access (grants/credentials/authorization) behavior. */
  readonly accessRuntime?: AccessRuntime
  /** Test seam: inject a fake GitHub credential resolver instead of the real GitHub App/PAT resolver built from `env`. */
  readonly githubTokenResolver?: GitHubTokenResolver
  /** Lets a caller (e.g. `cli-serve.ts`'s signal handling) register hooks that run before the
   * server closes -- e.g. aborting every in-flight autonomous execution. Also exposed on the
   * returned `StartedChatServer` so hooks can be registered after the server starts, not only
   * before. Defaults to a fresh instance when omitted. */
  readonly shutdownLifecycle?: ShutdownLifecycle
}

export interface StartedChatServer {
  readonly server: Server
  readonly url: string
  readonly host: string
  readonly port: number
  readonly warnings: readonly string[]
  readonly shutdownLifecycle: ShutdownLifecycle
  /** Stops accepting new connections, runs every registered shutdown hook, waits for in-flight
   * requests/SSE streams to end on their own, and force-destroys any still open after
   * `hardKillMs` (default 10s). Distinct from `server.close()` (still available directly on
   * `.server` for existing callers), which does none of that. */
  close(hardKillMs?: number): Promise<void>
}

export function assertChatServerCanStart(options: Pick<ChatServerOptions, 'apiKey'>): void {
  if (options.apiKey.trim().length === 0) {
    throw new ChatServerConfigError(
      'SYMBOLWRIGHT_API_KEY is required to start the chat server. Set it before running "symbolwright serve" (the legacy CODEMIND_API_KEY name still works).',
    )
  }
}

export function buildChatServerWarnings(
  options: Pick<ChatServerOptions, 'host' | 'tlsCertFile' | 'tlsKeyFile'>,
): readonly string[] {
  const warnings: string[] = []
  const isLoopback =
    options.host === '127.0.0.1' || options.host === 'localhost' || options.host === '::1'
  const hasTls = options.tlsCertFile !== undefined && options.tlsKeyFile !== undefined

  if (!isLoopback && !hasTls) {
    warnings.push(
      'Binding to a non-loopback host without SYMBOLWRIGHT_TLS_CERT_FILE/SYMBOLWRIGHT_TLS_KEY_FILE. ' +
        'Put this server behind a TLS-terminating reverse proxy before exposing it publicly.',
    )
  }

  return warnings
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) {
    return false
  }
  return timingSafeEqual(bufferA, bufferB)
}

export function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const header = req.headers.authorization
  if (header === undefined || !header.startsWith('Bearer ')) {
    return false
  }
  const presented = header.slice('Bearer '.length)
  return timingSafeEqualStrings(presented, apiKey)
}

/**
 * Resolves *who* is calling: the legacy local operator (the shared `SYMBOLWRIGHT_API_KEY` Bearer
 * token — unrestricted, matching every pre-existing behavior exactly) or an external agent
 * presenting a scoped `sw_agent_...` token issued by the delegated-agent-access subsystem
 * (`src/access/`). Every check here is live against the current grant/credential/session state —
 * a paused, revoked, or expired grant is rejected immediately, not just once at token-mint time.
 * Returns `undefined` when neither authentication mode succeeds (caller responds 401).
 */
export interface RequestPrincipal {
  readonly kind: RequestPrincipalKind
  readonly actor: string
  readonly principalId?: string
  readonly grantId?: string
  readonly sessionId?: string
}

function resolveRequestPrincipal(
  req: IncomingMessage,
  apiKey: string,
  accessRuntime: AccessRuntime,
): RequestPrincipal | undefined {
  if (isAuthorized(req, apiKey)) {
    return { kind: 'operator', actor: 'operator' }
  }

  const header = req.headers.authorization
  if (header === undefined || !header.startsWith('Bearer ')) return undefined
  const presented = header.slice('Bearer '.length)
  if (!presented.startsWith('sw_agent_')) return undefined

  try {
    const { grant, session } = accessRuntime.grantService.authenticateAgentToken(presented, {
      ip: clientIpFor(req),
    })
    return {
      kind: 'agent',
      actor: grant.displayName,
      principalId: grant.principalId,
      grantId: grant.id,
      sessionId: session.id,
    }
  } catch (error) {
    if (
      error instanceof InvalidCredentialError ||
      error instanceof SessionLimitExceededError ||
      error instanceof ClientConstraintViolationError ||
      error instanceof SessionInactivityTimeoutError
    ) {
      return undefined
    }
    throw error
  }
}

/**
 * Builds the per-tool-call authorization closure for `/api/agent`. Branch context is resolved
 * once per request (the branch actually checked out in `toolCwd`) and applied to every capability
 * check made during that agent turn — every mutating tool call in a turn operates against the
 * same working-tree branch, so this matches real usage without re-shelling out to `git` per call.
 */
async function buildToolAccessControl(
  agentPrincipal:
    { readonly principal: RequestPrincipal; readonly accessRuntime: AccessRuntime } | undefined,
  toolCwd: string,
): Promise<RuntimeToolContext['accessControl']> {
  if (agentPrincipal === undefined) return undefined
  const { principal, accessRuntime } = agentPrincipal
  const [branch, repository] = await Promise.all([
    resolveCurrentGitBranch(toolCwd),
    detectGitHubRepository(toolCwd),
  ])
  const branchContext: { branch?: string; isDefaultBranch?: boolean } =
    branch === undefined
      ? {}
      : { branch, isDefaultBranch: await isLikelyDefaultBranch(toolCwd, branch) }
  const repositoryContext: { repository?: string } = repository === undefined ? {} : { repository }

  return {
    principalId: principal.principalId as string,
    grantId: principal.grantId as string,
    ...(principal.sessionId === undefined ? {} : { sessionId: principal.sessionId }),
    requireAuthorized: async (
      capability: string,
      toolName: string,
      metadata?: Record<string, unknown>,
    ) => {
      await accessRuntime.authorizationService.requireAuthorized({
        principalId: principal.principalId as string,
        grantId: principal.grantId as string,
        ...(principal.sessionId === undefined ? {} : { sessionId: principal.sessionId }),
        capability,
        toolName,
        ...repositoryContext,
        ...branchContext,
        ...(metadata === undefined ? {} : { metadata }),
      })
    },
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

function applyCors(res: ServerResponse, corsOrigin: string | undefined): void {
  if (corsOrigin === undefined) {
    return
  }
  res.setHeader('access-control-allow-origin', corsOrigin)
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of req) {
    const buf = chunk as Buffer
    totalBytes += buf.length
    if (totalBytes > MAX_BODY_BYTES) {
      throw new ChatRequestValidationError(`Request body exceeds ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(buf)
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ChatRequestValidationError('Request body must be valid JSON')
  }
}

function buildEffectiveGateway(
  env: ProviderGatewayEnv,
  overrideStore: ProviderRuntimeOverrideStore,
  transport: ProviderHttpTransport | undefined,
): ProviderGateway {
  const base = loadProviderGatewayConfig(env)
  const effective = applyProviderRuntimeOverrides(base, overrideStore.snapshot())
  return new ProviderGateway({
    config: effective,
    ...(transport === undefined ? {} : { transport }),
  })
}

function buildProviderCatalog(): readonly {
  readonly id: string
  readonly displayName: string
  readonly defaultBaseUrl: string | undefined
  readonly capabilities: readonly string[]
}[] {
  return SYMBOLWRIGHT_PROVIDER_ADAPTERS.map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    defaultBaseUrl: adapter.defaultBaseUrl,
    capabilities: adapter.capabilities,
  }))
}

function clientIpFor(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function isSupportedProviderId(value: unknown): value is SymbolWrightProviderId {
  return (
    typeof value === 'string' &&
    (SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value)
  )
}

export function createChatServerRequestListener(
  options: ChatServerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const overrideStore = options.overrideStore ?? new ProviderRuntimeOverrideStore()
  const streamTransport = options.streamTransport ?? new FetchProviderStreamTransport()
  const rateLimiter =
    options.rateLimiter ?? new FixedWindowRateLimiter(DEFAULT_RATE_LIMIT_PER_MINUTE, 60_000)
  const deviceFlowRateLimiter =
    options.deviceFlowRateLimiter ??
    new FixedWindowRateLimiter(DEFAULT_DEVICE_FLOW_RATE_LIMIT_PER_MINUTE, 60_000)
  const env = options.env ?? process.env
  const localStatusProvider = options.localStatusProvider ?? collectStatus
  const cwd = options.cwd ?? process.cwd()
  const shutdownLifecycle = options.shutdownLifecycle ?? new ShutdownLifecycle()
  const missionService = options.missionService ?? new MissionService({ workspaceRoot: cwd, env })
  const accessRuntime = options.accessRuntime ?? new AccessRuntime({ workspaceRoot: cwd })
  const orchestrationRuntime = new OrchestrationRuntime({ workspaceRoot: cwd, accessRuntime })
  const sandboxService = new SandboxService({
    historyStore: new SandboxHistoryStore({ workspaceRoot: cwd, env }),
    env,
  })
  // Prefers a real GitHub App installation token (minted per-repository, short-lived) over the
  // static GITHUB_TOKEN PAT — see docs/security/DELEGATED_AGENT_ACCESS.md Section 6. Falls back to
  // the PAT automatically only when no App is configured at all; never widens silently when an
  // App *is* configured but lacks an installation for the requested repository.
  const githubTokenResolver = options.githubTokenResolver ?? createGitHubTokenResolver({ env })
  const hasGitHubCredential =
    options.githubTokenResolver !== undefined ||
    env['GITHUB_TOKEN'] !== undefined ||
    loadGitHubAppConfigFromEnv(env) !== undefined
  // Structural adapter onto `OrchestrationStore` for `mission-access-guard.ts`'s
  // `TeamVisibilitySource` -- `access/` has no dependency on `orchestration/`, so the guard
  // accepts this narrow shape rather than the concrete store type.
  const teamVisibilitySource = {
    listTeams: () => orchestrationRuntime.store.teams.list(),
    membersByTeam: (teamId: string) => orchestrationRuntime.store.membersByTeam(teamId),
  }
  const registryContext = {
    cwd,
    hasGitHubToken: hasGitHubCredential,
    missionService,
    teamSource: teamVisibilitySource,
  }
  const repositoryContext = {
    cwd: registryContext.cwd,
    policy: createRuntimePolicyForMode('APPROVED_EXECUTION', {
      hasGitHubToken: registryContext.hasGitHubToken,
    }),
    githubTokenResolver,
    ...(env['GITHUB_TOKEN'] !== undefined ? { githubToken: env['GITHUB_TOKEN'] } : {}),
    ...(options.githubPrCreationClient !== undefined
      ? { githubPrCreationClient: options.githubPrCreationClient }
      : {}),
    accessRuntime,
  }
  const missionContext = {
    service: missionService,
    cwd,
    accessRuntime,
    teamSource: teamVisibilitySource,
    shutdownLifecycle,
  }
  const sandboxContext = {
    service: sandboxService,
    missionService,
    teamSource: teamVisibilitySource,
  }
  // Resolved once per server process: the `owner/repo` identity a grant's `repositoryScope` is
  // checked against. A SymbolWright server process is always bound to exactly one working tree,
  // so "repository scope" means "is this process's repository in the grant's allowlist" rather
  // than a per-request selectable target.
  let cachedRepositoryIdentity: Promise<string | undefined> | undefined
  const resolveRepositoryIdentity = (): Promise<string | undefined> => {
    cachedRepositoryIdentity ??= detectGitHubRepository(repositoryContext.cwd)
    return cachedRepositoryIdentity
  }
  const githubIntakeContext = {
    service: missionService,
    cwd,
    githubTokenResolver,
    ...(env['GITHUB_TOKEN'] !== undefined ? { githubToken: env['GITHUB_TOKEN'] } : {}),
  }

  return (req, res) => {
    void handleRequest(req, res)
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    applyCors(res, options.corsOrigin)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { status: 'ok', name: 'SymbolWright Chat API' })
      return
    }

    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }

    // OAuth-device-flow request/poll endpoints are intentionally unauthenticated — see
    // `handleUnauthenticatedDeviceFlowRoute`'s doc comment for why that is safe. Being
    // unauthenticated, they sit ahead of the Bearer-token gate below, so they get their own
    // (stricter, IP-keyed) rate limit instead of relying on the post-auth limiter that never sees
    // them.
    if (url.pathname === '/api/v1/device-authorization' || url.pathname === '/api/v1/oauth/token') {
      if (!deviceFlowRateLimiter.consume(clientIpFor(req))) {
        sendJson(res, 429, { error: 'rate_limited' })
        return
      }
    }
    if (await handleUnauthenticatedDeviceFlowRoute(req, res, url, accessRuntime)) {
      return
    }

    const principal = resolveRequestPrincipal(req, options.apiKey, accessRuntime)
    if (principal === undefined) {
      sendJson(res, 401, { error: 'unauthorized' })
      return
    }

    // Keyed by grant when the caller is an authenticated agent so distinct grants sharing an
    // egress IP (NAT, shared CI runner) don't share one budget, and one grant can't be starved by
    // unrelated traffic from the same address; falls back to IP for the operator API key.
    const rateLimitKey = principal.grantId ?? clientIpFor(req)
    if (!rateLimiter.consume(rateLimitKey)) {
      sendJson(res, 429, { error: 'rate_limited' })
      return
    }

    try {
      if (
        await handleAccessRoute(req, res, url, {
          runtime: accessRuntime,
          actor: principal.actor,
          principalKind: principal.kind,
        })
      ) {
        return
      }

      if (
        await tryHandleAgentTeamRoute(req, res, url, {
          orchestration: orchestrationRuntime,
          accessRuntime,
          actor: principal.actor,
          principalKind: principal.kind,
          missionService,
          teamSource: teamVisibilitySource,
          ...(principal.principalId === undefined ? {} : { principalId: principal.principalId }),
          ...(principal.grantId === undefined ? {} : { grantId: principal.grantId }),
          ...(principal.sessionId === undefined ? {} : { sessionId: principal.sessionId }),
        })
      ) {
        return
      }

      if (principal.kind === 'agent' && !url.pathname.startsWith('/api/v1/')) {
        const requiredCapability = resolveRouteCapability(req.method ?? 'GET', url.pathname)
        if (requiredCapability === undefined) {
          sendJson(res, 403, {
            error: 'authorization_denied',
            reasonCode: 'ROUTE_NOT_PERMITTED',
            message: 'This agent grant does not permit this endpoint.',
          })
          return
        }
        let branchContext: { branch?: string; isDefaultBranch?: boolean } = {}
        if (BRANCH_SENSITIVE_ROUTE_CAPABILITIES.has(requiredCapability)) {
          const branch = await resolveCurrentGitBranch(repositoryContext.cwd)
          if (branch !== undefined) {
            branchContext = {
              branch,
              isDefaultBranch: await isLikelyDefaultBranch(repositoryContext.cwd, branch),
            }
          }
        }
        const repository = await resolveRepositoryIdentity()
        try {
          await accessRuntime.authorizationService.requireAuthorized({
            principalId: principal.principalId as string,
            grantId: principal.grantId as string,
            ...(principal.sessionId === undefined ? {} : { sessionId: principal.sessionId }),
            capability: requiredCapability,
            ...(repository === undefined ? {} : { repository }),
            ...branchContext,
          })
        } catch (authzError) {
          if (authzError instanceof ApprovalRequiredError) {
            sendJson(res, 403, {
              error: 'approval_required',
              reasonCode: authzError.decision.reasonCode,
              message: authzError.decision.reason,
              approvalRequestId: authzError.decision.approvalId,
              correlationId: authzError.decision.correlationId,
            })
            return
          }
          if (authzError instanceof AuthorizationDeniedError) {
            sendJson(res, 403, {
              error: 'authorization_denied',
              reasonCode: authzError.decision.reasonCode,
              message: authzError.decision.reason,
              requiredCapability,
              approvalPossible: false,
              correlationId: authzError.decision.correlationId,
            })
            return
          }
          throw authzError
        }

        if (requiredCapability === 'symbolwright.mission.create') {
          const limitExceeded = checkConcurrentMissionLimit(
            accessRuntime,
            missionService,
            principal.grantId as string,
          )
          if (limitExceeded !== undefined) {
            sendJson(res, 403, {
              error: 'execution_limit_exceeded',
              reasonCode: 'MAX_CONCURRENT_MISSIONS_EXCEEDED',
              message: `This grant already has ${limitExceeded.activeCount} active mission(s), at its configured limit of ${limitExceeded.maxConcurrentMissions}.`,
            })
            return
          }
        }
      }

      if (
        await handleGitHubIntakeRoute(req, res, url, {
          ...githubIntakeContext,
          accessRuntime,
          principalKind: principal.kind,
          ...(principal.principalId === undefined ? {} : { principalId: principal.principalId }),
          ...(principal.grantId === undefined ? {} : { grantId: principal.grantId }),
          ...(principal.sessionId === undefined ? {} : { sessionId: principal.sessionId }),
        })
      ) {
        return
      }

      if (
        await handleMissionRoute(req, res, url, {
          ...missionContext,
          ...(principal.grantId === undefined ? {} : { grantId: principal.grantId }),
        })
      ) {
        return
      }

      if (
        await handleSandboxRoute(req, res, url, {
          ...sandboxContext,
          ...(principal.grantId === undefined ? {} : { callerGrantId: principal.grantId }),
          ...(principal.principalId === undefined
            ? {}
            : { callerPrincipalId: principal.principalId }),
        })
      ) {
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/local-status') {
        sendJson(res, 200, await localStatusProvider())
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/providers') {
        const gateway = buildEffectiveGateway(env, overrideStore, options.transport)
        sendJson(res, 200, {
          redactedConfig: gateway.getRedactedConfig(),
          statuses: gateway.getProviderStatuses(),
          catalog: buildProviderCatalog(),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/providers/register') {
        const parsed = parseRegisterRequestBody(await readJsonBody(req))
        overrideStore.set(parsed.providerId, parsed.override)
        const gateway = buildEffectiveGateway(env, overrideStore, options.transport)
        sendJson(res, 200, {
          ok: true,
          providerId: parsed.providerId,
          redactedConfig: gateway.getRedactedConfig(),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/providers/reset') {
        const parsed = parseResetRequestBody(await readJsonBody(req))
        overrideStore.clear(parsed.providerId)
        sendJson(res, 200, { ok: true, providerId: parsed.providerId })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/providers/test') {
        await handleProviderTest(req, res, env, overrideStore, options.transport)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/chat') {
        await handleChat(req, res, env, overrideStore, options.transport, streamTransport)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/agent') {
        await handleAgent(
          req,
          res,
          env,
          overrideStore,
          missionService,
          cwd,
          principal.kind === 'agent' ? { principal, accessRuntime } : undefined,
          teamVisibilitySource,
        )
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/tools') {
        handleToolsRegistry(res)
        return
      }

      const grantScopedRegistryContext = {
        ...registryContext,
        ...(principal.grantId === undefined ? {} : { callerGrantId: principal.grantId }),
      }

      if (req.method === 'GET' && url.pathname === '/api/memory/recent') {
        handleMemoryRecent(req, res, grantScopedRegistryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/memory/procedural') {
        handleMemoryProcedural(res, grantScopedRegistryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/checkpoints') {
        handleCheckpointsList(req, res, grantScopedRegistryContext)
        return
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/checkpoints/')) {
        handleCheckpointDetail(
          url.pathname.slice('/api/checkpoints/'.length),
          res,
          grantScopedRegistryContext,
        )
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/repository/tree') {
        handleRepositoryTree(req, res, repositoryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/repository/file') {
        handleRepositoryFileRead(req, res, repositoryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/repository/status') {
        await handleRepositoryStatus(res, repositoryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/repository/diff') {
        await handleRepositoryDiff(req, res, repositoryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/repository/branches') {
        await handleRepositoryBranches(res, repositoryContext)
        return
      }

      if (req.method === 'PUT' && url.pathname === '/api/repository/file') {
        await handleRepositoryFileWrite(req, res, repositoryContext)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/repository/branches') {
        await handleRepositoryBranchCreate(req, res, {
          ...repositoryContext,
          ...(principal.grantId === undefined ? {} : { grantId: principal.grantId }),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/repository/commit') {
        await handleRepositoryCommit(req, res, repositoryContext)
        return
      }

      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/api/repository/checkpoints/') &&
        url.pathname.endsWith('/restore')
      ) {
        const checkpointId = url.pathname.slice(
          '/api/repository/checkpoints/'.length,
          -'/restore'.length,
        )
        handleRepositoryCheckpointRestore(checkpointId, res, repositoryContext)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/repository/push') {
        await handleRepositoryPush(req, res, {
          ...repositoryContext,
          ...(principal.grantId === undefined ? {} : { grantId: principal.grantId }),
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/repository/pull-request') {
        await handleRepositoryPullRequestCreate(req, res, repositoryContext)
        return
      }

      sendJson(res, 404, { error: 'not_found' })
    } catch (error) {
      if (
        error instanceof ChatRequestValidationError ||
        error instanceof ProviderRuntimeOverrideValidationError
      ) {
        sendJson(res, 400, { error: error.message })
        return
      }
      const normalized = normalizeProviderGatewayError(error)
      sendJson(res, 502, { error: normalized.message, code: normalized.code })
    }
  }
}

async function handleProviderTest(
  req: IncomingMessage,
  res: ServerResponse,
  env: ProviderGatewayEnv,
  overrideStore: ProviderRuntimeOverrideStore,
  transport: ProviderHttpTransport | undefined,
): Promise<void> {
  const body = await readJsonBody(req)
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const providerId = record['providerId'] ?? record['provider']
  if (!isSupportedProviderId(providerId)) {
    sendJson(res, 400, { error: 'providerId is required' })
    return
  }

  const gateway = buildEffectiveGateway(env, overrideStore, transport)
  try {
    const response: ProviderGatewayResponse = await gateway.runWithProvider(providerId, {
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
    })
    sendJson(res, 200, {
      ok: true,
      providerId: response.providerId,
      model: response.model,
      detail: `Received a response from ${response.providerId}`,
    })
  } catch (error) {
    const normalized = normalizeProviderGatewayError(error)
    sendJson(res, 200, { ok: false, providerId, detail: normalized.message, code: normalized.code })
  }
}

async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  env: ProviderGatewayEnv,
  overrideStore: ProviderRuntimeOverrideStore,
  transport: ProviderHttpTransport | undefined,
  streamTransport: ProviderStreamTransport,
): Promise<void> {
  const parsed = parseChatRequestBody(await readJsonBody(req))
  const gateway = buildEffectiveGateway(env, overrideStore, transport)

  const chatRequest = {
    messages: parsed.messages,
    ...(parsed.model === undefined ? {} : { model: parsed.model }),
    ...(parsed.systemPrompt === undefined ? {} : { systemPrompt: parsed.systemPrompt }),
    ...(parsed.temperature === undefined ? {} : { temperature: parsed.temperature }),
    ...(parsed.maxTokens === undefined ? {} : { maxTokens: parsed.maxTokens }),
  }

  if (!parsed.stream) {
    const response = await gateway.runWithProvider(parsed.providerId, chatRequest)
    sendJson(res, 200, {
      providerId: response.providerId,
      model: response.model,
      reply: response.text,
      ...(response.usage === undefined ? {} : { usage: response.usage }),
    })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  try {
    if (supportsRealtimeStreaming(parsed.providerId)) {
      const effectiveConfig = applyProviderRuntimeOverrides(
        loadProviderGatewayConfig(env),
        overrideStore.snapshot(),
      ).providers[parsed.providerId]
      if (effectiveConfig === undefined) {
        throw new ChatRequestValidationError(`Unknown provider: ${parsed.providerId}`)
      }
      for await (const delta of streamProviderChat(effectiveConfig, chatRequest, streamTransport)) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`)
      }
    } else {
      const response = await gateway.runWithProvider(parsed.providerId, chatRequest)
      res.write(`data: ${JSON.stringify({ delta: response.text })}\n\n`)
    }
    res.write('event: done\ndata: {}\n\n')
  } catch (error) {
    const normalized = normalizeProviderGatewayError(error)
    res.write(
      `event: error\ndata: ${JSON.stringify({ code: normalized.code, message: normalized.message })}\n\n`,
    )
  } finally {
    res.end()
  }
}

function resolveAgentEffectiveConfig(
  env: ProviderGatewayEnv,
  overrideStore: ProviderRuntimeOverrideStore,
  providerId: SymbolWrightProviderId,
) {
  const config = applyProviderRuntimeOverrides(
    loadProviderGatewayConfig(env),
    overrideStore.snapshot(),
  ).providers[providerId]
  if (config === undefined) {
    throw new ChatRequestValidationError(`Unknown provider: ${providerId}`)
  }
  return config
}

function appendNewCheckpointReferences(
  missionService: MissionService,
  missionId: string,
  workspaceRoot: string,
  beforeIds: ReadonlySet<string>,
  warnings: string[],
): void {
  try {
    for (const summary of listCheckpoints(workspaceRoot, missionId)) {
      if (beforeIds.has(summary.checkpointId)) continue
      const metadata = getCheckpoint(workspaceRoot, summary.checkpointId)
      if (metadata === undefined) continue
      missionService.attachCheckpoint(missionId, {
        checkpointId: metadata.checkpointId,
        createdAt: metadata.createdAt,
        paths: metadata.files.map((file) => file.targetPath),
      })
    }
  } catch (error) {
    warnings.push(
      `Checkpoint linkage was not saved: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function handleAgent(
  req: IncomingMessage,
  res: ServerResponse,
  env: ProviderGatewayEnv,
  overrideStore: ProviderRuntimeOverrideStore,
  missionService: MissionService,
  defaultCwd: string,
  agentPrincipal?: { readonly principal: RequestPrincipal; readonly accessRuntime: AccessRuntime },
  teamSource?: TeamVisibilitySource,
): Promise<void> {
  const parsed = parseAgentRequestBody(await readJsonBody(req))
  let mission: SymbolWrightMission | undefined
  if (parsed.missionId !== undefined) {
    try {
      mission = missionService.get(parsed.missionId)
    } catch (error) {
      if (error instanceof MissionNotFoundError) {
        sendJson(res, 404, { error: error.message })
        return
      }
      throw error
    }
    // A delegated caller may only run an agent turn against a mission it owns or actively
    // contributes to via a team -- otherwise it could read and append to another grant's mission
    // by simply supplying that mission's id (see mission-access-guard.ts).
    const visibility = resolveMissionVisibility(agentPrincipal?.principal.grantId, teamSource)
    const access = canAccessMission(mission, visibility, 'execute')
    if (!access.allowed) {
      if (access.relationship === 'none') {
        sendJson(res, 404, { error: `Mission not found: ${parsed.missionId}` })
      } else {
        sendJson(res, 403, {
          error: 'authorization_denied',
          reasonCode: 'MISSION_NOT_AUTHORIZED_FOR_OPERATION',
          message: `This grant may not run an agent turn against mission ${parsed.missionId}.`,
        })
      }
      return
    }
    if (mission.status !== 'ACTIVE') {
      sendJson(res, 409, {
        error: `Mission ${mission.id} is ${mission.status}. Resume or explicitly reopen it before sending agent work.`,
      })
      return
    }
  }

  let llmProvider: ReturnType<typeof resolveAgentLlmProvider>
  try {
    const effectiveConfig = resolveAgentEffectiveConfig(env, overrideStore, parsed.providerId)
    llmProvider = resolveAgentLlmProvider(effectiveConfig)
  } catch (error) {
    if (error instanceof AgentProviderMissingCredentialsError) {
      sendJson(res, 400, { error: error.message })
      return
    }
    throw error
  }

  const policy = createRuntimePolicyForMode(parsed.mode, {
    hasGitHubToken: env['GITHUB_TOKEN'] !== undefined,
  })
  const toolCwd = mission?.repository.rootPath ?? defaultCwd
  const toolAccessControl = await buildToolAccessControl(agentPrincipal, toolCwd)
  const toolContext: RuntimeToolContext = {
    cwd: toolCwd,
    policy,
    ...(mission === undefined ? {} : { sessionId: mission.id }),
    ...(toolAccessControl === undefined ? {} : { accessControl: toolAccessControl }),
  }
  const tools = assembleAgentTools()
  const priorMessages = parsed.priorMessages ?? mission?.agent.messages
  const agentConfig: AgentLoopConfig = {
    maxIterations: parsed.maxIterations,
    systemPrompt: parsed.systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT,
    ...(parsed.model === undefined ? {} : { model: parsed.model }),
    ...(parsed.maxTokens === undefined ? {} : { maxTokens: parsed.maxTokens }),
    ...(parsed.temperature === undefined ? {} : { temperature: parsed.temperature }),
    ...(priorMessages === undefined ? {} : { priorMessages }),
  }

  const missionWarnings: string[] = []
  const beforeCheckpointIds = new Set(
    mission === undefined
      ? []
      : listCheckpoints(toolCwd, mission.id).map((checkpoint) => checkpoint.checkpointId),
  )
  const persist = (operation: () => void, label: string): void => {
    if (mission === undefined) return
    try {
      operation()
    } catch (error) {
      missionWarnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (mission !== undefined) {
    persist(
      () =>
        missionService.recordAgentUserMessage(
          mission.id,
          parsed.message,
          parsed.mode,
          parsed.providerId,
          parsed.model,
        ),
      'User message was not persisted',
    )
  }

  const onAgentEvent = (event: AgentLoopEvent): void => {
    if (mission !== undefined) {
      if (event.type === 'tool_call_start') {
        persist(
          () => missionService.recordToolStarted(mission.id, event.id, event.name),
          `Tool start ${event.name} was not persisted`,
        )
      }
      if (event.type === 'tool_call_end') {
        persist(
          () =>
            missionService.recordToolCompleted(
              mission.id,
              event.id,
              event.name,
              event.output,
              event.isError,
              event.durationMs,
            ),
          `Tool result ${event.name} was not persisted`,
        )
      }
    }
  }

  const persistResult = (result: AgentLoopResult): void => {
    if (mission === undefined) return
    persist(
      () =>
        missionService.recordAgentResult(
          mission.id,
          result.finalMessages,
          result.finalText,
          result.status,
        ),
      'Assistant result was not persisted',
    )
    appendNewCheckpointReferences(
      missionService,
      mission.id,
      toolCwd,
      beforeCheckpointIds,
      missionWarnings,
    )
  }

  if (!parsed.stream) {
    const result = await runAgentLoop(
      llmProvider,
      parsed.message,
      tools,
      toolContext,
      agentConfig,
      onAgentEvent,
    )
    persistResult(result)
    sendJson(res, 200, {
      ...result,
      ...(mission === undefined ? {} : { missionId: mission.id }),
      ...(missionWarnings.length === 0 ? {} : { missionWarnings }),
    })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  try {
    const result = await runAgentLoop(
      llmProvider,
      parsed.message,
      tools,
      toolContext,
      agentConfig,
      (event: AgentLoopEvent) => {
        onAgentEvent(event)
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      },
    )
    persistResult(result)
    res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
    if (mission !== undefined) {
      let currentRevision: number | undefined
      try {
        currentRevision = missionService.get(mission.id).revision
      } catch {
        currentRevision = undefined
      }
      res.write(
        `event: mission_saved\ndata: ${JSON.stringify({
          missionId: mission.id,
          ...(currentRevision === undefined ? {} : { revision: currentRevision }),
          warnings: missionWarnings,
        })}\n\n`,
      )
    }
    res.write('event: done\ndata: {}\n\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (mission !== undefined) {
      persist(
        () =>
          missionService.appendEvent(
            mission.id,
            'agent.turn.failed',
            'Agent turn failed before a final result was produced.',
            { message },
          ),
        'Agent failure event was not persisted',
      )
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
    if (missionWarnings.length > 0) {
      res.write(
        `event: mission_saved\ndata: ${JSON.stringify({
          missionId: mission?.id,
          warnings: missionWarnings,
        })}\n\n`,
      )
    }
  } finally {
    res.end()
  }
}

export async function startChatServer(options: ChatServerOptions): Promise<StartedChatServer> {
  assertChatServerCanStart(options)
  const warnings = buildChatServerWarnings(options)
  // Resolved once, here, and threaded into `createChatServerRequestListener` below via the same
  // `??`-defaulting convention every other per-request dependency in this file uses -- so
  // whichever mission-linked subsystem registers a shutdown hook (e.g. the autonomy runtime's
  // abort-all-in-flight-executions hook) and the `close()` this function returns are always
  // talking to the exact same instance, never two independently-defaulted ones.
  const shutdownLifecycle = options.shutdownLifecycle ?? new ShutdownLifecycle()
  const listener = createChatServerRequestListener({ ...options, shutdownLifecycle })

  const started = await createAndStartHttpServer(listener, {
    host: options.host,
    port: options.port,
    ...(options.tlsCertFile === undefined ? {} : { tlsCertFile: options.tlsCertFile }),
    ...(options.tlsKeyFile === undefined ? {} : { tlsKeyFile: options.tlsKeyFile }),
  })

  return {
    server: started.server,
    url: started.url,
    host: started.host,
    port: started.port,
    warnings,
    shutdownLifecycle,
    close: async (hardKillMs?: number) => {
      await shutdownLifecycle.runHooks()
      await started.close(hardKillMs)
    },
  }
}
