import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { StdioMcpClient } from './stdio-mcp-client.js'
import type { McpServerConfig } from './mcp-types.js'

const fixturePath = fileURLToPath(
  new URL('../../../fixtures/mcp/stdio-fixture-server.mjs', import.meta.url),
)

function createFixtureServer(): McpServerConfig {
  return {
    name: 'fixture',
    transport: 'stdio',
    command: process.execPath,
    args: [fixturePath],
    env: { MCP_FIXTURE_SECRET: 'sk-test-secret-123456' },
    timeoutMs: 3000,
    allowedTools: ['echo', 'add', 'reveal_secret'],
    blockedTools: [],
  }
}

describe('StdioMcpClient', () => {
  it('initializes a local stdio MCP server and discovers tools', async () => {
    const client = new StdioMcpClient(createFixtureServer(), process.cwd())

    try {
      await client.connect()
      const tools = await client.listTools()
      expect(tools.map((tool) => tool.name)).toEqual(['echo', 'add', 'reveal_secret'])
    } finally {
      client.close()
    }
  })

  it('calls a local stdio MCP tool through JSON-RPC framing', async () => {
    const client = new StdioMcpClient(createFixtureServer(), process.cwd())

    try {
      await client.connect()
      const result = await client.callTool('add', { a: 2, b: 5 })
      expect(JSON.stringify(result)).toContain('7')
    } finally {
      client.close()
    }
  })
})
