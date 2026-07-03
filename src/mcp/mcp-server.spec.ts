import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { runCodemindMcpServer } from './mcp-server.js'

function collectLines(stream: PassThrough): { lines: () => string[] } {
  let buffer = ''
  const lines: string[] = []
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      lines.push(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
  })
  return { lines: () => lines }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('runCodemindMcpServer', () => {
  it('answers initialize, tools/list, and tools/call over injected stdio streams', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const collector = collectLines(output)

    const server = runCodemindMcpServer({ mode: 'READ_ONLY', cwd: process.cwd(), input, output })

    input.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      })}\n`,
    )
    await flush()

    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    await flush()

    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`)
    await flush()

    input.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'read_file', arguments: { path: 'package.json' } },
      })}\n`,
    )
    await flush()

    const lines = collector.lines().map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18' } })
    expect(lines[1]).toMatchObject({ id: 2 })
    const toolNames = (lines[1]?.['result'] as { tools: { name: string }[] }).tools.map(
      (t) => t.name,
    )
    expect(toolNames).toContain('read_file')
    expect(lines[2]).toMatchObject({
      id: 3,
      result: { content: [{ type: 'text' }] },
    })

    server.stop()
    await server.closed
  })

  it('ignores malformed JSON lines instead of crashing, and reports them via onProtocolWarning', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const collector = collectLines(output)
    const warnings: string[] = []

    const server = runCodemindMcpServer({
      mode: 'READ_ONLY',
      cwd: process.cwd(),
      input,
      output,
      onProtocolWarning: (line) => warnings.push(line),
    })

    input.write('not valid json\n')
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`)
    await flush()

    expect(warnings).toEqual(['not valid json'])
    expect(collector.lines()).toHaveLength(1)

    server.stop()
    await server.closed
  })

  it('resolves `closed` once the input stream ends', async () => {
    const input = new PassThrough()
    const output = new PassThrough()

    const server = runCodemindMcpServer({ mode: 'READ_ONLY', cwd: process.cwd(), input, output })
    input.end()

    await expect(server.closed).resolves.toBeUndefined()
  })
})
