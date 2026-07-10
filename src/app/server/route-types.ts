import type { Server } from 'node:http'

import type { ChatServerOptions } from '../../server/codemind-chat-server.js'

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
}
