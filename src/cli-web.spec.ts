import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { renderWebFetchCommand, renderWebSearchCommand } from './cli-web.js'

describe('cli-web', () => {
  let server: Server
  let baseUrl: string
  let workspaceDir: string

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>CLI Fixture</title></head><body>ok</body></html>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-cli-web-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  describe('renderWebFetchCommand', () => {
    it('blocks a localhost URL by default (no config)', async () => {
      const output = await renderWebFetchCommand([`${baseUrl}/`], workspaceDir)
      expect(output).toContain('Status: blocked')
      expect(output).toContain('private/internal address')
    })

    it('fetches a localhost URL with --allow-private', async () => {
      const output = await renderWebFetchCommand([`${baseUrl}/`, '--allow-private'], workspaceDir)
      expect(output).toContain('Status: ok')
      expect(output).toContain('Title: CLI Fixture')
    })

    it('supports --json output', async () => {
      const output = await renderWebFetchCommand(
        [`${baseUrl}/`, '--allow-private', '--json'],
        workspaceDir,
      )
      const parsed = JSON.parse(output) as { tool: string; status: string }
      expect(parsed.tool).toBe('web_fetch')
      expect(parsed.status).toBe('ok')
    })

    it('respects a --mode off override', async () => {
      const output = await renderWebFetchCommand(
        [`${baseUrl}/`, '--allow-private', '--mode', 'off'],
        workspaceDir,
      )
      expect(output).toContain('Status: blocked')
    })

    it('honors an explicit --config path', async () => {
      const customPath = join(workspaceDir, 'custom-config.json')
      writeFileSync(customPath, JSON.stringify({ web: { fetch: { allowPrivateNetwork: true } } }))

      const output = await renderWebFetchCommand(
        [`${baseUrl}/`, '--config', customPath],
        workspaceDir,
      )
      expect(output).toContain('Status: ok')
    })

    it('rejects an invalid --mode value', async () => {
      await expect(
        renderWebFetchCommand([`${baseUrl}/`, '--mode', 'paranoid'], workspaceDir),
      ).rejects.toThrow(/--mode must be one of/)
    })

    it('throws when no URL is given', async () => {
      await expect(renderWebFetchCommand([], workspaceDir)).rejects.toThrow(
        /Usage: codemind web fetch/,
      )
    })

    it('reads .symbolwright/config.json from the workspace root by default', async () => {
      mkdirSync(join(workspaceDir, '.symbolwright'), { recursive: true })
      writeFileSync(
        join(workspaceDir, '.symbolwright', 'config.json'),
        JSON.stringify({ web: { fetch: { allowPrivateNetwork: true } } }),
      )

      const output = await renderWebFetchCommand([`${baseUrl}/`], workspaceDir)
      expect(output).toContain('Status: ok')
    })
  })

  describe('renderWebSearchCommand', () => {
    it('throws when no query is given', async () => {
      await expect(renderWebSearchCommand([], workspaceDir)).rejects.toThrow(
        /Usage: codemind web search/,
      )
    })

    it('blocks and renders a reason when web.mode is off, without touching the network', async () => {
      const output = await renderWebSearchCommand(
        ['vitest', 'coverage', '--mode', 'off'],
        workspaceDir,
      )
      expect(output).toContain('Status: blocked')
    })

    it('supports --json output for a blocked search', async () => {
      const output = await renderWebSearchCommand(
        ['vitest', '--mode', 'off', '--json'],
        workspaceDir,
      )
      const parsed = JSON.parse(output) as { tool: string; status: string }
      expect(parsed.tool).toBe('web_search')
      expect(parsed.status).toBe('blocked')
    })
  })
})
