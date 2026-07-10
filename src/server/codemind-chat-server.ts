import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'

import {
  CODEMIND_PROVIDER_ADAPTERS,
  CODEMIND_SUPPORTED_PROVIDER_IDS,
  type CodemindProviderId,
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
import type { AgentLoopConfig, AgentLoopEvent } from '../agent/agent-loop.types.js'
import {
  handleCheckpointDetail,
  handleCheckpointsList,
  handleMemoryProcedural,
  handleMemoryRecent,
  handleToolsRegistry,
} from '../app/api/readonly-registry-routes.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { collectStatus } from '../web/status-runner.js'
import type { RuntimeStatusView } from '../web/status.js'
import { renderChatUiHtml } from './chat-ui-html.js'
import {
  AgentProviderMissingCredentialsError,
  resolveAgentLlmProvider,
} from './codemind-agent-provider.js'
import { parseAgentRequestBody } from './codemind-agent-request.js'
import {
  ChatRequestValidationError,
  parseChatRequestBody,
  parseRegisterRequestBody,
  parseResetRequestBody,
} from './codemind-chat-request.js'
import {
  FetchProviderStreamTransport,
  streamProviderChat,
  supportsRealtimeStreaming,
  type ProviderStreamTransport,
} from './provider-chat-stream.js'
import { FixedWindowRateLimiter, type RateLimiter } from './rate-limiter.js'

const DEFAULT_AGENT_SYSTEM_PROMPT =
  'You are CodeMind, a direct-capable coding agent. Use the available tools to accomplish the request.'

const MAX_BODY_BYTES = 256 * 1024
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60

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
  readonly localStatusProvider?: () => Promise<RuntimeStatusView>
  readonly cwd?: string
}

export interface StartedChatServer {
  readonly server: Server
  readonly url: string
  readonly host: string
  readonly port: number
  readonly warnings: readonly string[]
}

export function assertChatServerCanStart(options: Pick<ChatServerOptions, 'apiKey'>): void {
  if (options.apiKey.trim().length === 0) {
    throw new ChatServerConfigError(
      'CODEMIND_API_KEY is required to start the chat server. Set it before running "codemind serve".',
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
      'Binding to a non-loopback host without CODEMIND_TLS_CERT_FILE/CODEMIND_TLS_KEY_FILE. ' +
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

function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const header = req.headers.authorization
  if (header === undefined || !header.startsWith('Bearer ')) {
    return false
  }
  const presented = header.slice('Bearer '.length)
  return timingSafeEqualStrings(presented, apiKey)
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
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
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
  return CODEMIND_PROVIDER_ADAPTERS.map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    defaultBaseUrl: adapter.defaultBaseUrl,
    capabilities: adapter.capabilities,
  }))
}

function clientIpFor(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function isSupportedProviderId(value: unknown): value is CodemindProviderId {
  return (
    typeof value === 'string' &&
    (CODEMIND_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value)
  )
}

export function createChatServerRequestListener(
  options: ChatServerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const overrideStore = options.overrideStore ?? new ProviderRuntimeOverrideStore()
  const streamTransport = options.streamTransport ?? new FetchProviderStreamTransport()
  const rateLimiter =
    options.rateLimiter ?? new FixedWindowRateLimiter(DEFAULT_RATE_LIMIT_PER_MINUTE, 60_000)
  const env = options.env ?? process.env
  const localStatusProvider = options.localStatusProvider ?? collectStatus
  const registryContext = {
    cwd: options.cwd ?? process.cwd(),
    hasGitHubToken: env['GITHUB_TOKEN'] !== undefined,
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

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(renderChatUiHtml())
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { status: 'ok', name: 'CodeMind Chat API' })
      return
    }

    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }

    if (!isAuthorized(req, options.apiKey)) {
      sendJson(res, 401, { error: 'unauthorized' })
      return
    }

    if (!rateLimiter.consume(clientIpFor(req))) {
      sendJson(res, 429, { error: 'rate_limited' })
      return
    }

    try {
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
        await handleAgent(req, res, env, overrideStore)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/tools') {
        handleToolsRegistry(res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/memory/recent') {
        handleMemoryRecent(req, res, registryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/memory/procedural') {
        handleMemoryProcedural(res, registryContext)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/checkpoints') {
        handleCheckpointsList(req, res, registryContext)
        return
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/checkpoints/')) {
        handleCheckpointDetail(url.pathname.slice('/api/checkpoints/'.length), res, registryContext)
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
  providerId: CodemindProviderId,
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

async function handleAgent(
  req: IncomingMessage,
  res: ServerResponse,
  env: ProviderGatewayEnv,
  overrideStore: ProviderRuntimeOverrideStore,
): Promise<void> {
  const parsed = parseAgentRequestBody(await readJsonBody(req))

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
  const toolContext: RuntimeToolContext = { cwd: process.cwd(), policy }
  const tools = assembleAgentTools()

  const agentConfig: AgentLoopConfig = {
    maxIterations: parsed.maxIterations,
    systemPrompt: parsed.systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT,
    ...(parsed.model === undefined ? {} : { model: parsed.model }),
    ...(parsed.maxTokens === undefined ? {} : { maxTokens: parsed.maxTokens }),
    ...(parsed.temperature === undefined ? {} : { temperature: parsed.temperature }),
    ...(parsed.priorMessages === undefined ? {} : { priorMessages: parsed.priorMessages }),
  }

  if (!parsed.stream) {
    const result = await runAgentLoop(llmProvider, parsed.message, tools, toolContext, agentConfig)
    sendJson(res, 200, result)
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
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      },
    )
    res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
    res.write('event: done\ndata: {}\n\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
  } finally {
    res.end()
  }
}

export async function startChatServer(options: ChatServerOptions): Promise<StartedChatServer> {
  assertChatServerCanStart(options)
  const warnings = buildChatServerWarnings(options)
  const listener = createChatServerRequestListener(options)

  const server =
    options.tlsCertFile !== undefined && options.tlsKeyFile !== undefined
      ? createHttpsServer(
          {
            cert: readFileSync(options.tlsCertFile),
            key: readFileSync(options.tlsKeyFile),
          },
          listener,
        )
      : createHttpServer(listener)

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => resolve())
  })

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  const protocol = options.tlsCertFile !== undefined ? 'https' : 'http'

  return {
    server,
    url: `${protocol}://${options.host}:${port}`,
    host: options.host,
    port,
    warnings,
  }
}
