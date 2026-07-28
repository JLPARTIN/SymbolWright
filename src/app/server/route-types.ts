import type { Server } from 'node:http'

import type { ShutdownLifecycle } from './http-bootstrap.js'
import type { ChatServerOptions } from '../../server/symbolwright-chat-server.js'

/**
 * The unified server accepts exactly the same options `ChatServerOptions`
 * already does (api key, host/port, TLS, provider transports, rate
 * limiter, cwd, ...) -- merging the dashboard/workspace surface in does not
 * introduce any new required configuration.
 */
export type UnifiedServerOptions = ChatServerOptions

export interface StartedUnifiedServer {
  readonly server: Server
  readonly url: string
  readonly host: string
  readonly port: number
  readonly warnings: readonly string[]
  readonly shutdownLifecycle: ShutdownLifecycle
  /** Same graceful-shutdown behavior as `StartedChatServer.close()` -- see its doc comment. */
  close(hardKillMs?: number): Promise<void>
}
