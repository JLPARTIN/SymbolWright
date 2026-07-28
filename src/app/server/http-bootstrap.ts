import { readFileSync } from 'node:fs'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { Socket } from 'node:net'

/**
 * Extracted from `startChatServer`/`startUnifiedServer`, which previously each built their own
 * near-identical `http`/`https` server, listened, and resolved the address -- one canonical
 * implementation instead of two that can silently drift.
 */
export interface HttpBootstrapOptions {
  readonly host: string
  readonly port: number
  readonly tlsCertFile?: string
  readonly tlsKeyFile?: string
}

export interface StartedHttpServer {
  readonly server: Server
  readonly url: string
  readonly host: string
  readonly port: number
  readonly protocol: 'http' | 'https'
  /** Stops accepting new connections, waits for in-flight requests/SSE streams to end on their
   * own, and force-destroys any still open after `hardKillMs` (default 10s) -- a long-lived SSE
   * connection never ends itself, so a bare `server.close()` can otherwise hang indefinitely. */
  close(hardKillMs?: number): Promise<void>
}

export async function createAndStartHttpServer(
  listener: (req: IncomingMessage, res: ServerResponse) => void,
  options: HttpBootstrapOptions,
): Promise<StartedHttpServer> {
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

  const sockets = new Set<Socket>()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

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
    protocol,
    close: (hardKillMs?: number) => closeServerGracefully(server, sockets, hardKillMs),
  }
}

async function closeServerGracefully(
  server: Server,
  sockets: ReadonlySet<Socket>,
  hardKillMs = 10_000,
): Promise<void> {
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  const timer = setTimeout(() => {
    for (const socket of sockets) socket.destroy()
  }, hardKillMs)
  try {
    await closed
  } finally {
    clearTimeout(timer)
  }
}

export type ShutdownHook = () => Promise<void> | void

/**
 * A small registry of callbacks to run before a server closes, so a subsystem constructed after
 * (or independently of) the HTTP server -- e.g. the lazily-constructed autonomy runtime in
 * `mission-routes.ts` -- can still participate in graceful shutdown without `http-bootstrap.ts`
 * needing to know it exists. Hooks run best-effort: one hook throwing does not stop the others
 * from running or block shutdown from proceeding.
 */
export class ShutdownLifecycle {
  readonly #hooks: ShutdownHook[] = []

  onBeforeShutdown(hook: ShutdownHook): void {
    this.#hooks.push(hook)
  }

  async runHooks(): Promise<void> {
    for (const hook of this.#hooks) {
      try {
        await hook()
      } catch {
        // Best-effort: a failing hook must not prevent the process from actually shutting down.
      }
    }
  }
}
