import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import type { RuntimeToolContext } from '../types.js'
import { executeWebFetchTool, webFetchTool } from './web-fetch-tool.js'

describe('web-fetch-tool', () => {
  let server: Server
  let baseUrl: string
  let workspaceDir: string

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>Local Docs</title></head><body>hello</body></html>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-web-fetch-tool-'))
    mkdirSync(join(workspaceDir, '.symbolwright'), { recursive: true })
    writeFileSync(
      join(workspaceDir, '.symbolwright', 'config.json'),
      JSON.stringify({ web: { fetch: { allowPrivateNetwork: true } } }),
    )
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  function contextFor(mode: 'APPROVED_EXECUTION' | 'READ_ONLY'): RuntimeToolContext {
    return { cwd: workspaceDir, policy: createRuntimePolicyForMode(mode) }
  }

  it('is registered with the web_fetch name and WEB_ACCESS capability', () => {
    expect(webFetchTool.name).toBe('web_fetch')
    expect(webFetchTool.capability).toBe('WEB_ACCESS')
  })

  it('fetches a page and renders a status=ok result', async () => {
    const output = await executeWebFetchTool(
      { url: `${baseUrl}/` },
      contextFor('APPROVED_EXECUTION'),
    )
    expect(output).toContain('Status: ok')
    expect(output).toContain('Title: Local Docs')
  })

  it('works in READ_ONLY mode for the trusted local operator', async () => {
    const output = await executeWebFetchTool({ url: `${baseUrl}/` }, contextFor('READ_ONLY'))
    expect(output).toContain('Status: ok')
  })

  it('routes through the web_fetch RuntimeToolDefinition end-to-end', async () => {
    const output = await webFetchTool.execute(
      { url: `${baseUrl}/` },
      contextFor('APPROVED_EXECUTION'),
    )
    expect(output).toContain('Status: ok')
  })

  it('denies delegated callers so direct research network cannot bypass brokered egress', async () => {
    const delegated: RuntimeToolContext = {
      ...contextFor('APPROVED_EXECUTION'),
      accessControl: {
        principalId: 'principal-1',
        grantId: 'grant-1',
        requireAuthorized: async () => undefined,
      },
    }
    await expect(
      executeWebFetchTool({ url: `${baseUrl}/` }, delegated),
    ).rejects.toThrow(/BROKERED_EGRESS_REQUIRED/)
  })

  it('rejects missing url before touching the network', async () => {
    await expect(webFetchTool.execute({}, contextFor('APPROVED_EXECUTION'))).rejects.toThrow(
      /non-empty "url"/,
    )
  })

  it('rejects a non-object input', async () => {
    await expect(webFetchTool.execute('nope', contextFor('APPROVED_EXECUTION'))).rejects.toThrow(
      /requires an object input/,
    )
  })
})
