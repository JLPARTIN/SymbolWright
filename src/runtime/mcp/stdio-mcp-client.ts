import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { MCP_PROTOCOL_VERSION, type McpServerConfig, type McpToolDescriptor } from './mcp-types.js'
import { redactMcpText } from './mcp-redaction.js'

interface JsonRpcRequest {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly method: string
  readonly params?: unknown
}

interface JsonRpcResponse {
  readonly jsonrpc?: string
  readonly id?: unknown
  readonly result?: unknown
  readonly error?: {
    readonly code?: number
    readonly message?: string
    readonly data?: unknown
  }
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: NodeJS.Timeout
}

export function encodeMcpMessage(message: unknown): Buffer {
  const body = JSON.stringify(message)
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`
  return Buffer.from(`${header}${body}`, 'utf8')
}

export class McpMessageFramer {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer): readonly unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: unknown[] = []

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) {
        return messages
      }

      const header = this.buffer.subarray(0, headerEnd).toString('utf8')
      const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header)
      if (lengthMatch === null) {
        throw new Error('Invalid MCP frame: missing Content-Length header.')
      }

      const bodyLength = Number.parseInt(lengthMatch[1] ?? '', 10)
      const bodyStart = headerEnd + 4
      const totalLength = bodyStart + bodyLength
      if (this.buffer.length < totalLength) {
        return messages
      }

      const body = this.buffer.subarray(bodyStart, totalLength).toString('utf8')
      messages.push(JSON.parse(body) as unknown)
      this.buffer = this.buffer.subarray(totalLength)
    }
  }
}

function isResponse(message: unknown): message is JsonRpcResponse {
  return typeof message === 'object' && message !== null && 'id' in message
}

function parseToolDescriptors(result: unknown): readonly McpToolDescriptor[] {
  if (typeof result !== 'object' || result === null) {
    throw new Error('MCP tools/list response result must be an object.')
  }

  const tools = (result as Record<string, unknown>)['tools']
  if (!Array.isArray(tools)) {
    throw new Error('MCP tools/list response must include a tools array.')
  }

  return tools.map((tool, index) => {
    if (typeof tool !== 'object' || tool === null) {
      throw new Error(`MCP tool descriptor at index ${index} must be an object.`)
    }

    const record = tool as Record<string, unknown>
    const name = record['name']
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error(`MCP tool descriptor at index ${index} is missing name.`)
    }

    const descriptor: McpToolDescriptor = { name }
    const description = record['description']
    const inputSchema = record['inputSchema']

    if (typeof description === 'string') {
      return inputSchema === undefined
        ? { ...descriptor, description }
        : { ...descriptor, description, inputSchema }
    }

    return inputSchema === undefined ? descriptor : { ...descriptor, inputSchema }
  })
}

export class StdioMcpClient {
  private readonly framer = new McpMessageFramer()
  private readonly pending = new Map<number, PendingRequest>()
  private child: ChildProcessWithoutNullStreams | undefined
  private nextId = 1
  private closed = false
  private readonly stderrChunks: string[] = []

  constructor(
    private readonly server: McpServerConfig,
    private readonly cwd: string,
    private readonly redactionSecrets: readonly string[] = [],
  ) {}

  async connect(): Promise<void> {
    if (this.child !== undefined) {
      return
    }

    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const [key, value] of Object.entries(this.server.env)) {
      env[key] = value
    }

    this.child = spawn(this.server.command, [...this.server.args], {
      cwd: this.cwd,
      env,
      stdio: 'pipe',
    })

    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const message of this.framer.push(chunk)) {
          this.handleMessage(message)
        }
      } catch (error) {
        this.rejectAll(error instanceof Error ? error : new Error(String(error)))
      }
    })

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrChunks.push(redactMcpText(chunk.toString('utf8'), this.redactionSecrets))
    })

    this.child.on('error', (error) => {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)))
    })

    this.child.on('exit', (code, signal) => {
      if (!this.closed) {
        this.rejectAll(new Error(`MCP server exited before request completed: code=${code}, signal=${signal}`))
      }
    })

    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'codemind', version: '0.1.0' },
    })
    this.notify('notifications/initialized')
  }

  async listTools(): Promise<readonly McpToolDescriptor[]> {
    return parseToolDescriptors(await this.request('tools/list', {}))
  }

  async callTool(toolName: string, args: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    return this.request('tools/call', { name: toolName, arguments: args })
  }

  getRedactedStderr(): string {
    return this.stderrChunks.join('')
  }

  close(): void {
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
    }
    this.pending.clear()
    this.child?.kill()
    this.child = undefined
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (this.child === undefined) {
      throw new Error('MCP server is not connected.')
    }

    const child = this.child
    const id = this.nextId
    this.nextId += 1

    const request: JsonRpcRequest =
      params === undefined ? { jsonrpc: '2.0', id, method } : { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timed out after ${this.server.timeoutMs}ms: ${method}`))
      }, this.server.timeoutMs)

      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(encodeMcpMessage(request), (error) => {
        if (error !== undefined && error !== null) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  private notify(method: string, params?: unknown): void {
    if (this.child === undefined) {
      return
    }

    const notification =
      params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params }
    this.child.stdin.write(encodeMcpMessage(notification))
  }

  private handleMessage(message: unknown): void {
    if (!isResponse(message) || typeof message.id !== 'number') {
      return
    }

    const pending = this.pending.get(message.id)
    if (pending === undefined) {
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(message.id)

    if (message.error !== undefined) {
      pending.reject(
        new Error(message.error.message ?? `MCP JSON-RPC error ${message.error.code ?? 'unknown'}`),
      )
      return
    }

    pending.resolve(message.result)
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(error)
    }
  }
}
