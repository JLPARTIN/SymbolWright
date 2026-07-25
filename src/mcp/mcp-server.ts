import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import { handleMcpServerMessage, type McpServerInfo } from './mcp-server-protocol.js'
import { createSymbolWrightMcpToolHandler } from './mcp-server-tools.js'

export interface McpServerRuntimeOptions {
  readonly mode: SymbolWrightRuntimeMode
  readonly cwd: string
  readonly hasGitHubToken?: boolean
  readonly serverInfo?: McpServerInfo
  readonly input?: Readable
  readonly output?: Writable
  /** Called once per line that isn't valid JSON or valid JSON-RPC — for diagnostics only. */
  readonly onProtocolWarning?: (line: string) => void
}

export interface RunningMcpServer {
  /** Resolves once the input stream closes (client disconnected). */
  readonly closed: Promise<void>
  stop(): void
}

const DEFAULT_SERVER_INFO: McpServerInfo = { name: 'codemind', version: '0.1.0' }

/**
 * Speaks newline-delimited JSON-RPC 2.0 over stdio, mirroring the wire format
 * `McpStdioTransport` (the client side) expects when CodeMind itself is the
 * server being spawned by another MCP client.
 */
export function runSymbolWrightMcpServer(options: McpServerRuntimeOptions): RunningMcpServer {
  const handler = createSymbolWrightMcpToolHandler({
    mode: options.mode,
    cwd: options.cwd,
    ...(options.hasGitHubToken === undefined ? {} : { hasGitHubToken: options.hasGitHubToken }),
  })
  const serverInfo = options.serverInfo ?? DEFAULT_SERVER_INFO
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout

  const rl = createInterface({ input, terminal: false })

  rl.on('line', (line) => {
    void (async () => {
      const trimmed = line.trim()
      if (trimmed.length === 0) return

      let message: unknown
      try {
        message = JSON.parse(trimmed)
      } catch {
        options.onProtocolWarning?.(line)
        return
      }

      const response = await handleMcpServerMessage(message, handler, serverInfo)
      if (response !== undefined) {
        output.write(`${JSON.stringify(response)}\n`)
      }
    })()
  })

  const closed = new Promise<void>((resolve) => {
    rl.once('close', () => resolve())
  })

  return {
    closed,
    stop: () => rl.close(),
  }
}
