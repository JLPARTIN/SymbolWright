#!/usr/bin/env node
const tools = [
  {
    name: 'echo',
    description: 'Echo a message back to the caller.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
  {
    name: 'add',
    description: 'Add two numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
    },
  },
  {
    name: 'reveal_secret',
    description: 'Returns an environment secret so CodeMind redaction can be tested.',
    inputSchema: { type: 'object' },
  },
]

let buffer = Buffer.alloc(0)

function encode(message) {
  const body = JSON.stringify(message)
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}

function send(message) {
  process.stdout.write(encode(message))
}

function parseMessages(chunk) {
  buffer = Buffer.concat([buffer, chunk])
  const messages = []

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return messages

    const header = buffer.subarray(0, headerEnd).toString('utf8')
    const match = /^Content-Length:\s*(\d+)$/im.exec(header)
    if (match === null) {
      throw new Error('missing Content-Length')
    }

    const bodyLength = Number.parseInt(match[1], 10)
    const bodyStart = headerEnd + 4
    const totalLength = bodyStart + bodyLength
    if (buffer.length < totalLength) return messages

    const body = buffer.subarray(bodyStart, totalLength).toString('utf8')
    messages.push(JSON.parse(body))
    buffer = buffer.subarray(totalLength)
  }
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function fail(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32602, message } })
}

function handle(message) {
  if (message.id === undefined) return

  if (message.method === 'initialize') {
    ok(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'codemind-stdio-fixture', version: '1.0.0' },
    })
    return
  }

  if (message.method === 'tools/list') {
    ok(message.id, { tools })
    return
  }

  if (message.method === 'tools/call') {
    const name = message.params?.name
    const args = message.params?.arguments ?? {}

    if (name === 'echo') {
      ok(message.id, { content: [{ type: 'text', text: `echo:${args.message ?? ''}` }] })
      return
    }

    if (name === 'add') {
      ok(message.id, { content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }] })
      return
    }

    if (name === 'reveal_secret') {
      ok(message.id, {
        content: [{ type: 'text', text: `token=${process.env.MCP_FIXTURE_SECRET ?? 'none'}` }],
      })
      return
    }

    fail(message.id, `unknown tool: ${name}`)
    return
  }

  fail(message.id, `unknown method: ${message.method}`)
}

process.stdin.on('data', (chunk) => {
  for (const message of parseMessages(chunk)) {
    handle(message)
  }
})
