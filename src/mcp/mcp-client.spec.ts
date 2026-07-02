import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { McpServerConfig } from './mcp-config.js'
import { McpClient } from './mcp-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_SERVER_PATH = join(__dirname, '..', '..', 'fixtures', 'mcp', 'fixture-server.mjs')

function fixtureServerConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: 'fixture',
    command: 'node',
    args: [FIXTURE_SERVER_PATH],
    env: {},
    timeoutMs: 5000,
    ...overrides,
  }
}

describe('McpClient', () => {
  let client: McpClient | undefined

  afterEach(async () => {
    await client?.close()
    client = undefined
  })

  it('discovers tools from the real fixture server', async () => {
    client = new McpClient(fixtureServerConfig())
    const tools = await client.listTools()

    expect(tools.map((t) => t.name).sort()).toEqual(['echo', 'sleep', 'sum'])
  })

  it('calls the echo tool and returns its text content', async () => {
    client = new McpClient(fixtureServerConfig())
    const result = await client.callTool('echo', { text: 'hello mcp' })

    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'hello mcp' }])
  })

  it('calls the sum tool with numeric arguments', async () => {
    client = new McpClient(fixtureServerConfig())
    const result = await client.callTool('sum', { a: 2, b: 40 })

    expect(result.content[0]?.text).toBe('42')
  })

  it('surfaces tool-level errors via isError instead of throwing', async () => {
    client = new McpClient(fixtureServerConfig())
    const result = await client.callTool('echo', {})

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toMatch(/requires a "text"/)
  })

  it('surfaces unknown tool names as an error result rather than throwing', async () => {
    client = new McpClient(fixtureServerConfig())
    const result = await client.callTool('does_not_exist', {})

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toMatch(/Unknown tool/)
  })

  it('reuses the initialize handshake across multiple calls', async () => {
    client = new McpClient(fixtureServerConfig())
    await client.initialize()
    await client.initialize()
    const tools = await client.listTools()
    expect(tools.length).toBeGreaterThan(0)
  })

  it('applies a per-call timeout override', async () => {
    client = new McpClient(fixtureServerConfig({ timeoutMs: 10_000 }))
    await expect(client.callTool('sleep', { ms: 500 }, 50)).rejects.toThrow(/timed out after 50ms/)
  })
})
