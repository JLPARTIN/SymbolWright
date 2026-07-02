import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import { callMcpTool, discoverMcpTools, listMcpServers } from './mcp-runtime.js'
import type { McpConfig } from './mcp-config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_SERVER_PATH = join(__dirname, '..', '..', 'fixtures', 'mcp', 'fixture-server.mjs')

const ALLOWED_POLICY = createRuntimePolicyForMode('APPROVED_EXECUTION')
const BLOCKED_POLICY = createRuntimePolicyForMode('READ_ONLY')

function configWithFixtureServer(): McpConfig {
  return {
    servers: {
      fixture: {
        name: 'fixture',
        command: 'node',
        args: [FIXTURE_SERVER_PATH],
        env: {},
        timeoutMs: 5000,
      },
    },
  }
}

describe('listMcpServers', () => {
  it('reports the fixture server as reachable with its tool count', async () => {
    const [status] = await listMcpServers(configWithFixtureServer(), ALLOWED_POLICY)

    expect(status).toMatchObject({ name: 'fixture', reachable: true, toolCount: 3 })
  })

  it('reports servers as unreachable when policy blocks execution', async () => {
    const [status] = await listMcpServers(configWithFixtureServer(), BLOCKED_POLICY)

    expect(status?.reachable).toBe(false)
    expect(status?.error).toMatch(/disabled by runtime policy/)
  })

  it('reports a broken command as unreachable with a redacted error', async () => {
    const config: McpConfig = {
      servers: {
        broken: {
          name: 'broken',
          command: 'codemind-nonexistent-binary-xyz',
          args: [],
          env: {},
          timeoutMs: 2000,
        },
      },
    }

    const [status] = await listMcpServers(config, ALLOWED_POLICY)
    expect(status?.reachable).toBe(false)
  })
})

describe('discoverMcpTools', () => {
  it('lists tools for a single named server', async () => {
    const listings = await discoverMcpTools(configWithFixtureServer(), ALLOWED_POLICY, 'fixture')

    expect(listings).toHaveLength(1)
    expect(listings[0]?.tools.map((t) => t.name).sort()).toEqual(['echo', 'sleep', 'sum'])
  })

  it('lists tools across all configured servers when no name is given', async () => {
    const listings = await discoverMcpTools(configWithFixtureServer(), ALLOWED_POLICY)
    expect(listings.map((l) => l.server)).toEqual(['fixture'])
  })

  it('throws when policy blocks execution', async () => {
    await expect(discoverMcpTools(configWithFixtureServer(), BLOCKED_POLICY)).rejects.toThrow(
      /disabled by runtime policy/,
    )
  })

  it('throws for an unknown server name', async () => {
    await expect(
      discoverMcpTools(configWithFixtureServer(), ALLOWED_POLICY, 'missing'),
    ).rejects.toThrow(/Unknown MCP server "missing"/)
  })
})

describe('callMcpTool', () => {
  it('runs a tool end-to-end and returns evidence with an audit trace', async () => {
    const auditLog = new RuntimeAuditLog()
    const evidence = await callMcpTool({
      config: configWithFixtureServer(),
      policy: ALLOWED_POLICY,
      server: 'fixture',
      toolName: 'echo',
      arguments: { text: 'evidence check' },
      auditLog,
    })

    expect(evidence.status).toBe('ok')
    expect(evidence.isError).toBe(false)
    expect(evidence.content).toEqual([{ type: 'text', text: 'evidence check' }])
    expect(evidence.auditTrace).toHaveLength(1)
    expect(evidence.auditTrace[0]?.status).toBe('allowed')
    expect(auditLog.list()).toHaveLength(1)
  })

  it('redacts secrets in the tool result before they reach evidence output', async () => {
    const evidence = await callMcpTool({
      config: configWithFixtureServer(),
      policy: ALLOWED_POLICY,
      server: 'fixture',
      toolName: 'echo',
      arguments: { text: 'api_key: super-secret-value' },
    })

    expect(evidence.content[0]?.text).toContain('[REDACTED]')
  })

  it('returns status=blocked and records a blocked audit event when policy denies execution', async () => {
    const auditLog = new RuntimeAuditLog()
    const evidence = await callMcpTool({
      config: configWithFixtureServer(),
      policy: BLOCKED_POLICY,
      server: 'fixture',
      toolName: 'echo',
      arguments: { text: 'hi' },
      auditLog,
    })

    expect(evidence.status).toBe('blocked')
    expect(evidence.isError).toBe(true)
    expect(auditLog.list()).toEqual([expect.objectContaining({ status: 'blocked' })])
  })

  it('returns status=unknown_target for an unconfigured server', async () => {
    const evidence = await callMcpTool({
      config: configWithFixtureServer(),
      policy: ALLOWED_POLICY,
      server: 'missing',
      toolName: 'echo',
      arguments: {},
    })

    expect(evidence.status).toBe('unknown_target')
  })

  it('returns status=tool_error when the tool itself reports failure', async () => {
    const evidence = await callMcpTool({
      config: configWithFixtureServer(),
      policy: ALLOWED_POLICY,
      server: 'fixture',
      toolName: 'echo',
      arguments: {},
    })

    expect(evidence.status).toBe('tool_error')
    expect(evidence.isError).toBe(true)
  })

  it('returns status=transport_error and applies a per-call timeout', async () => {
    const evidence = await callMcpTool({
      config: configWithFixtureServer(),
      policy: ALLOWED_POLICY,
      server: 'fixture',
      toolName: 'sleep',
      arguments: { ms: 500 },
      timeoutMs: 50,
    })

    expect(evidence.status).toBe('transport_error')
    expect(evidence.content[0]?.text).toMatch(/timed out after 50ms/)
  })
})
