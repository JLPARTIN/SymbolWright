#!/usr/bin/env node
// CodeMind MCP fixture server.
//
// A minimal, dependency-free Model Context Protocol server speaking JSON-RPC 2.0
// over stdio (newline-delimited messages on stdout, logs on stderr). It exists
// purely so CodeMind's MCP runtime has one real, spawnable server to discover
// and call tools against in tests and the CLI reachability proof.
//
// Protocol surface implemented: initialize, notifications/initialized,
// tools/list, tools/call. Nothing else — this is a fixture, not a general
// MCP server implementation.

import { createInterface } from 'node:readline'

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_NAME = 'codemind-fixture-server'
const SERVER_VERSION = '1.0.0'

const TOOLS = [
  {
    name: 'echo',
    description: 'Echoes back the provided text.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'sum',
    description: 'Adds two numbers and returns the result.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
  },
  {
    name: 'sleep',
    description: 'Sleeps for the given number of milliseconds, then returns.',
    inputSchema: {
      type: 'object',
      properties: { ms: { type: 'number' } },
      required: ['ms'],
    },
  },
]

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

async function callTool(name, args) {
  const params = args && typeof args === 'object' ? args : {}

  switch (name) {
    case 'echo': {
      if (typeof params.text !== 'string') {
        throw new Error('echo requires a "text" string argument')
      }
      return textResult(params.text)
    }
    case 'sum': {
      if (typeof params.a !== 'number' || typeof params.b !== 'number') {
        throw new Error('sum requires numeric "a" and "b" arguments')
      }
      return textResult(String(params.a + params.b))
    }
    case 'sleep': {
      const ms = typeof params.ms === 'number' ? params.ms : 0
      await new Promise((resolve) => setTimeout(resolve, ms))
      return textResult(`slept ${ms}ms`)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function handleRequest(request) {
  const { id, method, params } = request

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      }
    }

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
    }

    if (method === 'tools/call') {
      const name = params?.name
      const toolArgs = params?.arguments
      try {
        const result = await callTool(name, toolArgs)
        return { jsonrpc: '2.0', id, result }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          result: textResult(error instanceof Error ? error.message : String(error), true),
        }
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${String(method)}` },
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    }
  }
}

const rl = createInterface({ input: process.stdin, terminal: false })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return
  }

  let message
  try {
    message = JSON.parse(trimmed)
  } catch {
    process.stderr.write(`fixture-server: failed to parse line as JSON: ${trimmed}\n`)
    return
  }

  // Notifications carry no "id" and get no response.
  if (message.id === undefined) {
    if (message.method === 'notifications/initialized') {
      process.stderr.write('fixture-server: client initialized\n')
    }
    return
  }

  handleRequest(message)
    .then((response) => writeMessage(response))
    .catch((error) => {
      process.stderr.write(`fixture-server: unhandled error: ${String(error)}\n`)
    })
})

process.stderr.write('fixture-server: ready\n')
