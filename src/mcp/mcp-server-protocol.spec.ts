import { describe, expect, it } from 'vitest'

import {
  handleMcpServerMessage,
  MCP_DEFAULT_PROTOCOL_VERSION,
  type McpServerToolHandler,
} from './mcp-server-protocol.js'

const SERVER_INFO = { name: 'symbolwright', version: '0.2.0' }

const FAKE_HANDLER: McpServerToolHandler = {
  list: () => [
    {
      name: 'read_file',
      description: 'Read a workspace file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  ],
  async call(name, args) {
    if (name === 'read_file') {
      return { content: [{ type: 'text', text: `contents of ${(args as { path: string }).path}` }] }
    }
    if (name === 'boom') {
      throw new Error('kaboom')
    }
    return { content: [{ type: 'text', text: `unknown: ${name}` }], isError: true }
  },
}

describe('handleMcpServerMessage', () => {
  it('handles initialize and echoes back a supported protocol version', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      FAKE_HANDLER,
      SERVER_INFO,
    )

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    })
  })

  it('falls back to the default protocol version for an unsupported request', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      FAKE_HANDLER,
      SERVER_INFO,
    )

    expect(response).toMatchObject({
      result: { protocolVersion: MCP_DEFAULT_PROTOCOL_VERSION },
    })
  })

  it('returns no response for the notifications/initialized notification', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toBeUndefined()
  })

  it('answers ping with an empty result', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 2, method: 'ping' },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toEqual({ jsonrpc: '2.0', id: 2, result: {} })
  })

  it('lists tools from the handler', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: { tools: FAKE_HANDLER.list() },
    })
  })

  it('calls a tool with its arguments and wraps the text result', async () => {
    const response = await handleMcpServerMessage(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'read_file', arguments: { path: 'README.md' } },
      },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 4,
      result: { content: [{ type: 'text', text: 'contents of README.md' }] },
    })
  })

  it('rejects tools/call with a missing or non-string name', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: {} },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toMatchObject({ id: 5, error: { code: -32602 } })
  })

  it('surfaces a thrown tool error as a JSON-RPC result instead of crashing the server', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'boom' } },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 6,
      result: { content: [{ type: 'text', text: 'Tool "boom" failed: kaboom' }], isError: true },
    })
  })

  it('returns a method-not-found error for an unknown method', async () => {
    const response = await handleMcpServerMessage(
      { jsonrpc: '2.0', id: 7, method: 'not/a/real/method' },
      FAKE_HANDLER,
      SERVER_INFO,
    )
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32601, message: 'Method not found: not/a/real/method' },
    })
  })

  it('returns undefined for non-object or method-less messages', async () => {
    expect(await handleMcpServerMessage(null, FAKE_HANDLER, SERVER_INFO)).toBeUndefined()
    expect(await handleMcpServerMessage('a string', FAKE_HANDLER, SERVER_INFO)).toBeUndefined()
    expect(
      await handleMcpServerMessage({ jsonrpc: '2.0', id: 1 }, FAKE_HANDLER, SERVER_INFO),
    ).toBeUndefined()
  })
})
