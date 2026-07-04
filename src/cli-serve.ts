import type { ProviderGatewayEnv } from './providers/provider-config.js'
import {
  startChatServer,
  type ChatServerOptions,
  type StartedChatServer,
} from './server/codemind-chat-server.js'

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

function readEnv(env: ProviderGatewayEnv, key: string): string | undefined {
  const value = env[key]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

export function resolveChatServerOptions(
  args: ServeCommandArgs,
  env: ProviderGatewayEnv,
): ChatServerOptions {
  const apiKey = readEnv(env, 'CODEMIND_API_KEY') ?? ''
  const host = args.host ?? readEnv(env, 'CODEMIND_CHAT_HOST') ?? DEFAULT_HOST
  const portFromEnv = readEnv(env, 'CODEMIND_CHAT_PORT')
  const port = args.port ?? (portFromEnv === undefined ? DEFAULT_PORT : parsePort(portFromEnv))
  const corsOrigin = args.corsOrigin ?? readEnv(env, 'CODEMIND_CORS_ORIGIN')
  const tlsCertFile = readEnv(env, 'CODEMIND_TLS_CERT_FILE')
  const tlsKeyFile = readEnv(env, 'CODEMIND_TLS_KEY_FILE')

  return {
    apiKey,
    host,
    port,
    ...(corsOrigin !== undefined ? { corsOrigin } : {}),
    ...(tlsCertFile !== undefined ? { tlsCertFile } : {}),
    ...(tlsKeyFile !== undefined ? { tlsKeyFile } : {}),
  }
}

export function renderServeBanner(server: StartedChatServer): string {
  const lines = [
    'CodeMind Chat Server',
    '',
    `Listening: ${server.url}`,
    '',
    'Routes:',
    '- GET  /                      chat UI',
    '- GET  /api/health            public health check',
    '- GET  /api/providers         list configured providers (auth required)',
    '- POST /api/providers/register  register or override a provider (auth required)',
    '- POST /api/providers/reset      clear a provider override (auth required)',
    '- POST /api/providers/test       verify provider credentials (auth required)',
    '- POST /api/chat                 send a chat turn, set "stream": true for live tokens (auth required)',
    '- POST /api/agent                run the real tool-execution agent loop (auth required)',
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
  const server = await startChatServer(options)
  console.log(renderServeBanner(server))
  await new Promise<never>(() => undefined)
}
