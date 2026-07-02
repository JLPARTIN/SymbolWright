import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import type { RuntimeToolContext } from '../types.js'
import { executeMcpCallTool, mcpCallTool } from './mcp-call-tool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_SERVER_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'mcp',
  'fixture-server.mjs',
)

describe('mcp-call-tool', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'codemind-mcp-tool-'))
    mkdirSync(join(workspaceDir, '.codemind'), { recursive: true })
    writeFileSync(
      join(workspaceDir, '.codemind', 'mcp.json'),
      JSON.stringify({
        servers: { fixture: { command: 'node', args: [FIXTURE_SERVER_PATH] } },
      }),
    )
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  function contextFor(mode: 'APPROVED_EXECUTION' | 'READ_ONLY'): RuntimeToolContext {
    return { cwd: workspaceDir, policy: createRuntimePolicyForMode(mode) }
  }

  it('is registered with the mcp_call name and MCP_TOOL capability', () => {
    expect(mcpCallTool.name).toBe('mcp_call')
    expect(mcpCallTool.capability).toBe('MCP_TOOL')
  })

  it('calls the fixture server and renders a status=ok result', async () => {
    const output = await executeMcpCallTool(
      { server: 'fixture', tool: 'echo', arguments: { text: 'hello from the tool' } },
      contextFor('APPROVED_EXECUTION'),
    )

    expect(output).toContain('Status: ok')
    expect(output).toContain('hello from the tool')
  })

  it('routes through the mcp_call RuntimeToolDefinition end-to-end', async () => {
    const output = await mcpCallTool.execute(
      { server: 'fixture', tool: 'sum', arguments: { a: 1, b: 2 } },
      contextFor('APPROVED_EXECUTION'),
    )

    expect(output).toContain('Status: ok')
    expect(output).toContain('3')
  })

  it('reports status=blocked when policy disallows execution', async () => {
    const output = await executeMcpCallTool(
      { server: 'fixture', tool: 'echo', arguments: { text: 'hi' } },
      contextFor('READ_ONLY'),
    )

    expect(output).toContain('Status: blocked')
  })

  it('rejects missing required fields before touching the runtime', async () => {
    await expect(
      mcpCallTool.execute({ server: '', tool: 'echo' }, contextFor('APPROVED_EXECUTION')),
    ).rejects.toThrow(/non-empty "server"/)

    await expect(
      mcpCallTool.execute({ server: 'fixture', tool: '' }, contextFor('APPROVED_EXECUTION')),
    ).rejects.toThrow(/non-empty "tool"/)
  })

  it('rejects a non-object input', async () => {
    await expect(
      mcpCallTool.execute('not-an-object', contextFor('APPROVED_EXECUTION')),
    ).rejects.toThrow(/requires an object input/)
  })
})
