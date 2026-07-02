import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

/** A JSON-RPC 2.0 request sent to an MCP server over stdio. */
export interface JsonRpcRequest {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly method: string
  readonly params?: unknown
}

/** A JSON-RPC 2.0 notification — no id, no response expected. */
export interface JsonRpcNotification {
  readonly jsonrpc: '2.0'
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcSuccessResponse {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly result: unknown
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly error: { readonly code: number; readonly message: string }
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse

export interface McpStdioTransportOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly maxStderrBytes?: number
}

const DEFAULT_MAX_STDERR_BYTES = 64 * 1024

interface PendingRequest {
  readonly resolve: (response: JsonRpcResponse) => void
  readonly reject: (error: Error) => void
}

/**
 * Owns one spawned MCP server process and speaks newline-delimited JSON-RPC 2.0
 * over its stdio, per the MCP stdio transport spec: JSON-RPC messages on
 * stdout/stdin (one per line), free-form logs on stderr.
 */
export class McpStdioTransport {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, PendingRequest>()
  private readonly maxStderrBytes: number
  private nextId = 1
  private stderrBuffer = ''
  private closed = false
  private spawnError: Error | undefined

  constructor(options: McpStdioTransportOptions) {
    this.maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES
    this.child = spawn(options.command, [...options.args], {
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // A write after the child has exited raises EPIPE on the stdin stream; without
    // a handler that's an unhandled 'error' event, which crashes the process.
    this.child.stdin.on('error', () => {})

    this.child.on('error', (error) => {
      this.spawnError = error
      this.rejectAllPending(error)
    })

    this.child.on('exit', () => {
      if (!this.closed) {
        this.rejectAllPending(new Error('MCP server process exited unexpectedly'))
      }
    })

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString('utf-8')
      if (this.stderrBuffer.length > this.maxStderrBytes) {
        this.stderrBuffer = this.stderrBuffer.slice(-this.maxStderrBytes)
      }
    })

    const rl = createInterface({ input: this.child.stdout, terminal: false })
    rl.on('line', (line) => this.handleLine(line))
  }

  private rejectAllPending(error: Error): void {
    for (const handlers of this.pending.values()) {
      handlers.reject(error)
    }
    this.pending.clear()
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (trimmed.length === 0) return

    let message: unknown
    try {
      message = JSON.parse(trimmed)
    } catch {
      return
    }

    if (typeof message !== 'object' || message === null || !('id' in message)) {
      return
    }

    const response = message as JsonRpcResponse
    const handlers = this.pending.get(response.id)
    if (handlers === undefined) return
    this.pending.delete(response.id)
    handlers.resolve(response)
  }

  /** Captured stderr output from the server process, bounded to avoid unbounded growth. */
  get stderrLog(): string {
    return this.stderrBuffer
  }

  /** Set when the underlying process failed to spawn (e.g. command not found). */
  get spawnFailure(): Error | undefined {
    return this.spawnError
  }

  notify(method: string, params?: unknown): void {
    if (this.closed || this.spawnError !== undefined) return
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }
    this.write(message)
  }

  async request(method: string, params: unknown, timeoutMs: number): Promise<JsonRpcResponse> {
    if (this.spawnError !== undefined) {
      throw this.spawnError
    }
    if (this.closed) {
      throw new Error('MCP transport is closed')
    }

    const id = this.nextId++
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (response) => {
          clearTimeout(timer)
          resolve(response)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })

      this.write(message)
    })
  }

  private write(message: JsonRpcRequest | JsonRpcNotification): void {
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.rejectAllPending(new Error('MCP transport closed before response arrived'))

    if (this.child.exitCode !== null || this.child.killed) {
      return
    }

    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => {
        this.child.kill('SIGKILL')
      }, 2000)

      this.child.once('exit', () => {
        clearTimeout(forceKill)
        resolve()
      })

      this.child.stdin.end()
      this.child.kill('SIGTERM')
    })
  }
}
