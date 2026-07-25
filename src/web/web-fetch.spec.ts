import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import { DEFAULT_WEB_CONFIG, mergeWebConfig } from './web-config.js'
import { performWebFetch } from './web-fetch.js'

const ALLOWING_RUNTIME_POLICY = createRuntimePolicyForMode('READ_ONLY')

describe('performWebFetch', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (url.pathname === '/docs') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(
          '<html><head><title>SymbolWright Docs</title></head><body><p>api_key: super-secret-token-value</p></body></html>',
        )
        return
      }

      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  function localWebConfig() {
    return mergeWebConfig({ fetch: { allowPrivateNetwork: true } })
  }

  it('fetches a real page end-to-end and produces evidence with a hash and audit trace', async () => {
    const auditLog = new RuntimeAuditLog()
    const evidence = await performWebFetch({
      url: `${baseUrl}/docs`,
      webConfig: localWebConfig(),
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      auditLog,
    })

    expect(evidence.status).toBe('ok')
    expect(evidence.title).toBe('SymbolWright Docs')
    expect(evidence.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(evidence.auditTrace).toHaveLength(1)
    expect(evidence.auditTrace[0]?.status).toBe('allowed')
    expect(auditLog.list()).toHaveLength(1)
  })

  it('redacts secrets from the excerpt before they reach evidence output', async () => {
    const evidence = await performWebFetch({
      url: `${baseUrl}/docs`,
      webConfig: localWebConfig(),
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
    })

    expect(evidence.excerpt).toContain('[REDACTED]')
    expect(evidence.excerpt).not.toContain('super-secret-token-value')
  })

  it('blocks a private-network target by default without touching the network', async () => {
    const auditLog = new RuntimeAuditLog()
    const evidence = await performWebFetch({
      url: `${baseUrl}/docs`,
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      auditLog,
    })

    expect(evidence.status).toBe('blocked')
    expect(evidence.reason).toMatch(/private\/internal address/)
    expect(auditLog.list()).toEqual([expect.objectContaining({ status: 'blocked' })])
  })

  it('blocks and records an invalid URL without throwing', async () => {
    const evidence = await performWebFetch({
      url: 'not a url',
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
    })

    expect(evidence.status).toBe('blocked')
    expect(evidence.reason).toMatch(/Invalid URL/)
  })

  it('blocks everything when the coarse runtime policy denies read-only network', async () => {
    const evidence = await performWebFetch({
      url: `${baseUrl}/docs`,
      webConfig: localWebConfig(),
      runtimePolicy: { ...ALLOWING_RUNTIME_POLICY, allowReadOnlyNetwork: false },
    })

    expect(evidence.status).toBe('blocked')
    expect(evidence.reason).toMatch(/disabled by runtime policy/)
  })

  it('reports a 404 as http_error with evidence still populated', async () => {
    const evidence = await performWebFetch({
      url: `${baseUrl}/missing`,
      webConfig: localWebConfig(),
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
    })

    expect(evidence.status).toBe('http_error')
    expect(evidence.httpStatus).toBe(404)
  })
})
