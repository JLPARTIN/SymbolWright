import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { McpStdioTransport } from './mcp-stdio-transport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_SERVER_PATH = join(__dirname, '..', '..', 'fixtures', 'mcp', 'fixture-server.mjs')

describe('McpStdioTransport', () => {
  let transport: McpStdioTransport | undefined

  afterEach(async () => {
    await transport?.close()
    transport = undefined
  })

  it('performs a request/response round trip against a real stdio server', async () => {
    transport = new McpStdioTransport({ command: 'node', args: [FIXTURE_SERVER_PATH] })

    const response = await transport.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
      5000,
    )

    expect('result' in response).toBe(true)
  })

  it('captures stderr output from the server', async () => {
    transport = new McpStdioTransport({ command: 'node', args: [FIXTURE_SERVER_PATH] })
    await transport.request('tools/list', {}, 5000)

    // Give the stderr 'ready' log a tick to flush before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(transport.stderrLog).toContain('fixture-server: ready')
  })

  it('rejects with a timeout error when the server is too slow', async () => {
    transport = new McpStdioTransport({ command: 'node', args: [FIXTURE_SERVER_PATH] })
    await transport.request('initialize', { protocolVersion: '2024-11-05' }, 5000)

    await expect(
      transport.request('tools/call', { name: 'sleep', arguments: { ms: 500 } }, 50),
    ).rejects.toThrow(/timed out after 50ms/)
  })

  it('rejects pending requests when the command does not exist', async () => {
    transport = new McpStdioTransport({ command: 'symbolwright-nonexistent-binary-xyz', args: [] })

    await expect(transport.request('initialize', {}, 2000)).rejects.toThrow()
    expect(transport.spawnFailure).toBeDefined()
  })

  it('close() is idempotent and safe to call multiple times', async () => {
    transport = new McpStdioTransport({ command: 'node', args: [FIXTURE_SERVER_PATH] })
    await transport.request('initialize', {}, 5000)

    await transport.close()
    await transport.close()
  })

  it('rejects requests made after close()', async () => {
    transport = new McpStdioTransport({ command: 'node', args: [FIXTURE_SERVER_PATH] })
    await transport.request('initialize', {}, 5000)
    await transport.close()

    await expect(transport.request('tools/list', {}, 2000)).rejects.toThrow(/closed/)
  })
})
