import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { evaluateMcpToolPolicy, loadMcpConfig, parseMcpConfigJson } from './mcp-config.js'

describe('parseMcpConfigJson', () => {
  it('parses bounded local stdio server config objects', () => {
    const config = parseMcpConfigJson(
      JSON.stringify({
        servers: {
          fixture: {
            transport: 'stdio',
            command: 'node',
            args: ['fixtures/mcp/stdio-fixture-server.mjs'],
            env: { MCP_FIXTURE_SECRET: 'sk-test-secret-123456' },
            timeoutMs: 3000,
            allowedTools: ['echo', 'add'],
            blockedTools: ['reveal_secret'],
          },
        },
      }),
      '.codemind/mcp.json',
    )

    expect(config.servers).toHaveLength(1)
    expect(config.servers[0]?.name).toBe('fixture')
    expect(config.servers[0]?.transport).toBe('stdio')
    expect(config.servers[0]?.allowedTools).toEqual(['echo', 'add'])
    expect(config.servers[0]?.blockedTools).toEqual(['reveal_secret'])
  })

  it('rejects unsupported non-stdio transports instead of inventing fantasy connectors', () => {
    expect(() =>
      parseMcpConfigJson(
        JSON.stringify({
          servers: {
            remote: {
              transport: 'websocket',
              command: 'node',
            },
          },
        }),
        '.codemind/mcp.json',
      ),
    ).toThrow('unsupported transport')
  })

  it('loads config through the workspace boundary', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-mcp-config-'))
    fs.mkdirSync(path.join(root, '.codemind'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.codemind', 'mcp.json'),
      JSON.stringify({
        servers: {
          fixture: { command: 'node', args: ['fixtures/mcp/stdio-fixture-server.mjs'] },
        },
      }),
    )

    try {
      expect(loadMcpConfig(root).servers[0]?.name).toBe('fixture')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('evaluateMcpToolPolicy', () => {
  it('honors allowedTools and blockedTools', () => {
    const server = parseMcpConfigJson(
      JSON.stringify({
        servers: {
          fixture: {
            command: 'node',
            allowedTools: ['echo'],
            blockedTools: ['reveal_secret'],
          },
        },
      }),
      '.codemind/mcp.json',
    ).servers[0]!

    expect(evaluateMcpToolPolicy(server, 'echo').allowed).toBe(true)
    expect(evaluateMcpToolPolicy(server, 'add').allowed).toBe(false)
    expect(evaluateMcpToolPolicy(server, 'reveal_secret').allowed).toBe(false)
  })
})
