import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_MCP_TIMEOUT_MS,
  loadMcpConfig,
  parseMcpConfig,
  requireMcpServer,
  resolveMcpConfigPath,
} from './mcp-config.js'

describe('mcp-config', () => {
  describe('parseMcpConfig', () => {
    it('parses a minimal server entry with defaults', () => {
      const config = parseMcpConfig(
        JSON.stringify({ servers: { fixture: { command: 'node' } } }),
      )

      expect(config.servers['fixture']).toEqual({
        name: 'fixture',
        command: 'node',
        args: [],
        env: {},
        timeoutMs: DEFAULT_MCP_TIMEOUT_MS,
      })
    })

    it('parses a fully specified server entry', () => {
      const config = parseMcpConfig(
        JSON.stringify({
          servers: {
            fixture: {
              command: 'node',
              args: ['fixtures/mcp/fixture-server.mjs'],
              env: { FOO: 'bar' },
              cwd: '/workspace',
              timeoutMs: 5000,
            },
          },
        }),
      )

      expect(config.servers['fixture']).toEqual({
        name: 'fixture',
        command: 'node',
        args: ['fixtures/mcp/fixture-server.mjs'],
        env: { FOO: 'bar' },
        cwd: '/workspace',
        timeoutMs: 5000,
      })
    })

    it('returns an empty server map when servers is omitted', () => {
      expect(parseMcpConfig('{}').servers).toEqual({})
    })

    it('throws on invalid JSON', () => {
      expect(() => parseMcpConfig('{not json')).toThrow(/not valid JSON/)
    })

    it('throws when top-level value is not an object', () => {
      expect(() => parseMcpConfig('[]')).toThrow(/must be a JSON object/)
    })

    it('throws when a server is missing command', () => {
      expect(() => parseMcpConfig(JSON.stringify({ servers: { fixture: {} } }))).toThrow(
        /command must be a non-empty string/,
      )
    })

    it('throws when args is not an array of strings', () => {
      expect(() =>
        parseMcpConfig(JSON.stringify({ servers: { fixture: { command: 'node', args: [1] } } })),
      ).toThrow(/args must be an array of strings/)
    })

    it('throws when env value is not a string', () => {
      expect(() =>
        parseMcpConfig(
          JSON.stringify({ servers: { fixture: { command: 'node', env: { FOO: 1 } } } }),
        ),
      ).toThrow(/env\["FOO"\] must be a string/)
    })

    it('throws when timeoutMs is not positive', () => {
      expect(() =>
        parseMcpConfig(
          JSON.stringify({ servers: { fixture: { command: 'node', timeoutMs: -1 } } }),
        ),
      ).toThrow(/timeoutMs must be a positive number/)
    })
  })

  describe('resolveMcpConfigPath', () => {
    it('joins workspace root with .codemind/mcp.json', () => {
      expect(resolveMcpConfigPath('/repo')).toBe(join('/repo', '.codemind', 'mcp.json'))
    })
  })

  describe('loadMcpConfig', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'codemind-mcp-config-'))
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('returns an empty config when no file exists', () => {
      expect(loadMcpConfig(dir)).toEqual({ servers: {} })
    })

    it('loads and parses .codemind/mcp.json from the workspace root', () => {
      mkdirSync(join(dir, '.codemind'), { recursive: true })
      writeFileSync(
        join(dir, '.codemind', 'mcp.json'),
        JSON.stringify({ servers: { fixture: { command: 'node' } } }),
      )

      const config = loadMcpConfig(dir)
      expect(config.servers['fixture']?.command).toBe('node')
    })

    it('honors an explicit path override', () => {
      const explicitPath = join(dir, 'custom-mcp.json')
      writeFileSync(explicitPath, JSON.stringify({ servers: { fixture: { command: 'node' } } }))

      const config = loadMcpConfig(dir, explicitPath)
      expect(config.servers['fixture']?.command).toBe('node')
    })
  })

  describe('requireMcpServer', () => {
    it('returns the matching server config', () => {
      const config = parseMcpConfig(JSON.stringify({ servers: { fixture: { command: 'node' } } }))
      expect(requireMcpServer(config, 'fixture').command).toBe('node')
    })

    it('throws a descriptive error for unknown servers', () => {
      const config = parseMcpConfig(JSON.stringify({ servers: { fixture: { command: 'node' } } }))
      expect(() => requireMcpServer(config, 'missing')).toThrow(/Unknown MCP server "missing"/)
    })
  })
})
