import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  assertChatServerCanStart,
  buildChatServerWarnings,
  createChatServerRequestListener,
} from '../../server/symbolwright-chat-server.js'
import { createAndStartHttpServer, ShutdownLifecycle } from './http-bootstrap.js'
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

    if (await tryHandleUnifiedRoute(req, res, url, options.apiKey)) {
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
  // Same single-resolution convention as `startChatServer` -- see its comment for why this must
  // not be independently defaulted in two places.
  const shutdownLifecycle = options.shutdownLifecycle ?? new ShutdownLifecycle()
  const listener = createUnifiedRequestListener({ ...options, shutdownLifecycle })

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
