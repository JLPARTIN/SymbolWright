import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderMcpCallCommand, renderMcpListCommand, renderMcpToolsCommand } from './cli-mcp.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_SERVER_PATH = join(__dirname, '..', 'fixtures', 'mcp', 'fixture-server.mjs')

describe('cli-mcp', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-cli-mcp-'))
    mkdirSync(join(workspaceDir, '.symbolwright'), { recursive: true })
    writeFileSync(
      join(workspaceDir, '.symbolwright', 'mcp.json'),
      JSON.stringify({
        servers: { fixture: { command: 'node', args: [FIXTURE_SERVER_PATH] } },
      }),
    )
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  describe('renderMcpListCommand', () => {
    it('reports no servers configured when mcp.json is absent', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'symbolwright-cli-mcp-empty-'))
      try {
        const output = await renderMcpListCommand([], emptyDir)
        expect(output).toContain('No servers configured')
      } finally {
        rmSync(emptyDir, { recursive: true, force: true })
      }
    })

    it('lists the fixture server as reachable with its tool count', async () => {
      const output = await renderMcpListCommand([], workspaceDir)
      expect(output).toContain('fixture: node')
      expect(output).toContain('reachable (3 tools)')
    })

    it('honors an explicit --config path', async () => {
      const customPath = join(workspaceDir, 'custom-mcp.json')
      writeFileSync(
        customPath,
        JSON.stringify({ servers: { fixture: { command: 'node', args: [FIXTURE_SERVER_PATH] } } }),
      )
      const output = await renderMcpListCommand(['--config', customPath], '/nonexistent')
      expect(output).toContain('reachable (3 tools)')
    })
  })

  describe('renderMcpToolsCommand', () => {
    it('lists all tools for the fixture server', async () => {
      const output = await renderMcpToolsCommand([], workspaceDir)
      expect(output).toContain('Server: fixture')
      expect(output).toContain('- echo: Echoes back the provided text.')
      expect(output).toContain('- sum:')
      expect(output).toContain('- sleep:')
    })

    it('scopes to a single named server', async () => {
      const output = await renderMcpToolsCommand(['fixture'], workspaceDir)
      expect(output).toContain('Server: fixture')
    })
  })

  describe('renderMcpCallCommand', () => {
    it('calls a tool using the "server.tool" form', async () => {
      const output = await renderMcpCallCommand(
        ['fixture.echo', JSON.stringify({ text: 'cli round trip' })],
        workspaceDir,
      )
      expect(output).toContain('Status: ok')
      expect(output).toContain('cli round trip')
    })

    it('defaults to the sole configured server when only a bare tool name is given', async () => {
      const output = await renderMcpCallCommand(
        ['sum', JSON.stringify({ a: 4, b: 5 })],
        workspaceDir,
      )
      expect(output).toContain('Status: ok')
      expect(output).toContain('9')
    })

    it('applies a --timeout override', async () => {
      const output = await renderMcpCallCommand(
        ['fixture.sleep', JSON.stringify({ ms: 500 }), '--timeout', '50'],
        workspaceDir,
      )
      expect(output).toContain('Status: transport_error')
      expect(output).toContain('timed out after 50ms')
    })

    it('throws when no target is given', async () => {
      await expect(renderMcpCallCommand([], workspaceDir)).rejects.toThrow(
        /Usage: symbolwright mcp call/,
      )
    })

    it('throws on invalid JSON arguments', async () => {
      await expect(
        renderMcpCallCommand(['fixture.echo', 'not-json'], workspaceDir),
      ).rejects.toThrow(/Failed to parse tool arguments/)
    })
  })
})
