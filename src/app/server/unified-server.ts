import { readFileSync } from 'node:fs'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'

import {
  assertChatServerCanStart,
  buildChatServerWarnings,
  createChatServerRequestListener,
} from '../../server/symbolwright-chat-server.js'
import { tryHandleUnifiedRoute } from './route-table.js'
import type { StartedUnifiedServer, UnifiedServerOptions } from './route-types.js'

export { ChatServerConfigError } from '../../server/symbolwright-chat-server.js'
export type { StartedUnifiedServer, UnifiedServerOptions } from './route-types.js'

/**
 * Builds the single request listener for the unified SymbolWright server --
 * one process, one port, serving the app shell, the (unauthenticated)
 * Workspace API, and the (authenticated) provider/chat/agent/tools/
 * memory/checkpoints API that used to live on a separate port behind
 * `symbolwright serve`.
 *
 * This composes rather than rewrites: the new routes (shell root,
 * `/workspace` redirect, `/api/status` alias, Workspace API) are checked
 * first via `tryHandleUnifiedRoute`; anything unmatched falls through to
 * the existing, already-tested `createChatServerRequestListener` dispatch
 * unchanged, so its auth gate, CORS handling, rate limiting, request-size
 * caps, and SSE streaming behavior for `/api/chat` and `/api/agent` are
 * preserved exactly as they are today -- merging servers must not mean
 * rewriting the security-relevant parts of either one.
 */
export function createUnifiedRequestListener(
  options: UnifiedServerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const chatListener = createChatServerRequestListener(options)

  return (req, res) => {
    void handleRequest(req, res)
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (await tryHandleUnifiedRoute(req, res, url)) {
      return
    }

    chatListener(req, res)
  }
}

export async function startUnifiedServer(
  options: UnifiedServerOptions,
): Promise<StartedUnifiedServer> {
  assertChatServerCanStart(options)
  const warnings = buildChatServerWarnings(options)
  const listener = createUnifiedRequestListener(options)

  const server: Server =
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
