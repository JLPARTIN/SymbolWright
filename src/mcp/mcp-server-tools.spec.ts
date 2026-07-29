import { describe, expect, it } from 'vitest'

import {
  McpAgentTokenAuthenticationError,
  createSymbolWrightMcpToolHandler,
} from './mcp-server-tools.js'

describe('createSymbolWrightMcpToolHandler', () => {
  it('exposes only read-safe tools in READ_ONLY mode', () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const names = handler.list().map((tool) => tool.name)

    expect(names).toContain('read_file')
    expect(names).toContain('list_files')
    expect(names).toContain('search_files')
    expect(names).not.toContain('bash')
    expect(names).not.toContain('local_file_write')
    expect(names).not.toContain('edit_file')
    expect(names).not.toContain('apply_patch')
  })

  it('exposes the full tool set in APPROVED_EXECUTION mode', () => {
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: process.cwd(),
    })
    const names = handler.list().map((tool) => tool.name)

    expect(names).toContain('bash')
    expect(names).toContain('local_file_write')
    expect(names).toContain('edit_file')
  })

  it('requires explicit repository and branch context before authenticating delegated MCP', () => {
    expect(() =>
      createSymbolWrightMcpToolHandler({
        mode: 'APPROVED_EXECUTION',
        cwd: process.cwd(),
        agentToken: 'sw_agent_untrusted_fixture',
      }),
    ).toThrow(McpAgentTokenAuthenticationError)
    expect(() =>
      createSymbolWrightMcpToolHandler({
        mode: 'APPROVED_EXECUTION',
        cwd: process.cwd(),
        agentToken: 'sw_agent_untrusted_fixture',
      }),
    ).toThrow(/explicit repository and branch context/)
  })

  it('every listed tool has a valid JSON-schema-shaped inputSchema', () => {
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: process.cwd(),
    })
    for (const tool of handler.list()) {
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.inputSchema.properties).toBe('object')
    }
  })

  it('calls a real read-only tool and returns file contents as text', async () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const result = await handler.call('read_file', { path: 'package.json' })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('"name": "symbolwright"')
  })

  it('refuses to call a tool not exposed by the current mode', async () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const result = await handler.call('bash', { command: 'echo hi' })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Unknown or unavailable tool')
  })

  it('returns a graceful error instead of throwing when a tool call fails', async () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const result = await handler.call('read_file', { path: 'this-file-does-not-exist.txt' })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('failed')
  })
})
