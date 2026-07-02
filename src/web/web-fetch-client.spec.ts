import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { executeWebFetch } from './web-fetch-client.js'

const ALLOW_ALL = (): { allowed: true } => ({ allowed: true })
const HTML_CONTENT_TYPES = ['text/html', 'text/plain', 'application/json']

describe('executeWebFetch', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (url.pathname === '/ok') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html><head><title>Hello</title></head><body><p>Hello world</p></body></html>')
        return
      }

      if (url.pathname === '/redirect-once') {
        res.writeHead(302, { location: '/ok' })
        res.end()
        return
      }

      if (url.pathname === '/redirect-loop') {
        res.writeHead(302, { location: '/redirect-loop' })
        res.end()
        return
      }

      if (url.pathname === '/big') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('x'.repeat(1000))
        return
      }

      if (url.pathname === '/binary') {
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end('binary-ish')
        return
      }

      if (url.pathname === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/plain' })
          res.end('too late')
        }, 2000)
        return
      }

      if (url.pathname === '/not-found') {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('nope')
        return
      }

      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('fetches a real page over a real local HTTP server', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/ok`,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('ok')
    expect(result.httpStatus).toBe(200)
    expect(result.contentType).toBe('text/html')
    expect(result.body).toContain('Hello world')
    expect(result.truncated).toBe(false)
  })

  it('follows a redirect and re-validates the hop', async () => {
    const validatedUrls: string[] = []
    const result = await executeWebFetch({
      url: `${baseUrl}/redirect-once`,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: (url) => {
        validatedUrls.push(url.pathname)
        return { allowed: true }
      },
    })

    expect(result.outcome).toBe('ok')
    expect(result.finalUrl).toBe(`${baseUrl}/ok`)
    expect(validatedUrls).toEqual(['/redirect-once', '/ok'])
  })

  it('blocks a hop when validateHop rejects it (SSRF-via-redirect guard)', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/redirect-once`,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: (url) =>
        url.pathname === '/ok'
          ? { allowed: false, reason: 'redirected into a blocked target' }
          : { allowed: true },
    })

    expect(result.outcome).toBe('blocked')
    expect(result.reason).toMatch(/redirected into a blocked target/)
  })

  it('stops following redirects past maxRedirects', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/redirect-loop`,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
      maxRedirects: 2,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('http_error')
    expect(result.reason).toMatch(/Exceeded maxRedirects/)
  })

  it('caps the response body at maxBytes and reports truncation', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/big`,
      timeoutMs: 5000,
      maxBytes: 100,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('ok')
    expect(result.body.length).toBe(100)
    expect(result.truncated).toBe(true)
  })

  it('blocks content types outside the allowlist', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/binary`,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('blocked')
    expect(result.reason).toMatch(/Content-Type/)
  })

  it('times out slow responses', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/slow`,
      timeoutMs: 100,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('transport_error')
    expect(result.reason).toMatch(/timed out/)
  })

  it('reports non-2xx responses as http_error without blocking', async () => {
    const result = await executeWebFetch({
      url: `${baseUrl}/not-found`,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('http_error')
    expect(result.httpStatus).toBe(404)
  })

  it('reports transport errors for a connection that cannot be established', async () => {
    const result = await executeWebFetch({
      url: 'http://127.0.0.1:1',
      timeoutMs: 2000,
      maxBytes: 1_000_000,
      maxRedirects: 5,
      allowedContentTypes: HTML_CONTENT_TYPES,
      validateHop: ALLOW_ALL,
    })

    expect(result.outcome).toBe('transport_error')
  })
})
