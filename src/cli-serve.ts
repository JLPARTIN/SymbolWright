import { startUnifiedServer } from './app/server/unified-server.js'
import type { StartedUnifiedServer, UnifiedServerOptions } from './app/server/route-types.js'
import type { ProviderGatewayEnv } from './providers/provider-config.js'
import { readEnvWithLegacyFallback } from './config/env-compat.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8787

export interface ServeCommandArgs {
  readonly host?: string
  readonly port?: number
  readonly corsOrigin?: string
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`)
  }
  return parsed
}

export function parseServeArgs(args: readonly string[]): ServeCommandArgs {
  let host: string | undefined
  let port: number | undefined
  let corsOrigin: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue

    if (arg === '--host') {
      host = args[++i]
      continue
    }
    if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length)
      continue
    }
    if (arg === '--port') {
      const value = args[++i]
      if (value === undefined) throw new Error('Missing value for --port')
      port = parsePort(value)
      continue
    }
    if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length))
      continue
    }
    if (arg === '--cors-origin') {
      corsOrigin = args[++i]
      continue
    }
    if (arg.startsWith('--cors-origin=')) {
      corsOrigin = arg.slice('--cors-origin='.length)
      continue
    }
    throw new Error(`Unknown serve flag: ${arg}`)
  }

  return {
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(corsOrigin !== undefined ? { corsOrigin } : {}),
  }
}

function readCompatEnv(
  env: ProviderGatewayEnv,
  canonicalKey: string,
  legacyKey: string,
  sensitive = false,
): string | undefined {
  const value = readEnvWithLegacyFallback(canonicalKey, legacyKey, { env, sensitive })
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

export function resolveChatServerOptions(
  args: ServeCommandArgs,
  env: ProviderGatewayEnv,
): UnifiedServerOptions {
  const apiKey = readCompatEnv(env, 'SYMBOLWRIGHT_API_KEY', 'CODEMIND_API_KEY', true) ?? ''
  const host =
    args.host ?? readCompatEnv(env, 'SYMBOLWRIGHT_CHAT_HOST', 'CODEMIND_CHAT_HOST') ?? DEFAULT_HOST
  const portFromEnv = readCompatEnv(env, 'SYMBOLWRIGHT_CHAT_PORT', 'CODEMIND_CHAT_PORT')
  const port = args.port ?? (portFromEnv === undefined ? DEFAULT_PORT : parsePort(portFromEnv))
  const corsOrigin =
    args.corsOrigin ?? readCompatEnv(env, 'SYMBOLWRIGHT_CORS_ORIGIN', 'CODEMIND_CORS_ORIGIN')
  const tlsCertFile = readCompatEnv(env, 'SYMBOLWRIGHT_TLS_CERT_FILE', 'CODEMIND_TLS_CERT_FILE')
  const tlsKeyFile = readCompatEnv(env, 'SYMBOLWRIGHT_TLS_KEY_FILE', 'CODEMIND_TLS_KEY_FILE')

  return {
    apiKey,
    host,
    port,
    ...(corsOrigin !== undefined ? { corsOrigin } : {}),
    ...(tlsCertFile !== undefined ? { tlsCertFile } : {}),
    ...(tlsKeyFile !== undefined ? { tlsKeyFile } : {}),
  }
}

export function renderServeBanner(server: StartedUnifiedServer): string {
  const lines = [
    'SymbolWright',
    '',
    `Listening: ${server.url}`,
    '',
    'Routes:',
    '- GET  /                          unified app shell (dashboard, workspace, agent, tools, memory, checkpoints, settings)',
    '- GET  /workspace                 redirects to /#/workspace (bookmark compatibility)',
    '- GET  /api/health                public health check',
    '- GET  /api/status                runtime status (auth required)',
    '- GET  /api/workspace/languages   Universal Workspace language/runner registry',
    '- POST /api/workspace/run         run code through a server-side runner',
    '- POST /api/workspace/intelligence  prepare a code-intelligence draft for the Agent view',
    '- GET  /api/local-status          browser-only mode: local doctor/release-readiness diagnostics (auth required)',
    '- GET  /api/providers             list configured providers (auth required)',
    '- POST /api/providers/register    register or override a provider (auth required)',
    '- POST /api/providers/reset       clear a provider override (auth required)',
    '- POST /api/providers/test        verify provider credentials (auth required)',
    '- POST /api/chat                  send a chat turn, set "stream": true for live tokens (auth required)',
    '- POST /api/agent                 run the real tool-execution agent loop (auth required)',
    '- GET  /api/tools                 tool registry, static + dynamically-wired (auth required)',
    '- GET  /api/memory/recent         recent episodic memory (auth required)',
    '- GET  /api/memory/procedural     procedural memory rules (auth required)',
    '- GET  /api/checkpoints           checkpoints created before mutating writes (auth required)',
    '- GET  /api/checkpoints/:id       one checkpoint by id (auth required)',
  ]

  if (server.warnings.length > 0) {
    lines.push('', 'Warnings:', ...server.warnings.map((warning) => `- ${warning}`))
  }

  return lines.join('\n')
}

export async function runServeCommand(
  args: readonly string[],
  env: ProviderGatewayEnv = process.env,
): Promise<void> {
  const options = resolveChatServerOptions(parseServeArgs(args), env)
  const server = await startUnifiedServer(options)
  console.log(renderServeBanner(server))
  await new Promise<never>(() => undefined)
}
