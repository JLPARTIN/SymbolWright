import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { DuckDuckGoSearchProvider, parseDuckDuckGoHtml } from './web-search-provider.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_HTML = readFileSync(
  join(__dirname, '..', '..', 'fixtures', 'web', 'duckduckgo-sample.html'),
  'utf-8',
)

describe('parseDuckDuckGoHtml', () => {
  it('extracts title, resolved url, and snippet for each result', () => {
    const results = parseDuckDuckGoHtml(FIXTURE_HTML, 8)

    expect(results).toHaveLength(3)
    expect(results[0]).toEqual({
      title: 'Coverage — Vitest',
      url: 'https://vitest.dev/guide/coverage.html',
      snippet:
        'Configuring coverage thresholds for branches, statements, functions, and lines in Vitest.',
    })
    expect(results[1]?.url).toBe('https://www.typescriptlang.org/docs/')
    expect(results[2]?.url).toBe('https://eslint.org/docs/latest/')
  })

  it('decodes HTML entities in titles and snippets', () => {
    const results = parseDuckDuckGoHtml(FIXTURE_HTML, 8)
    expect(results[1]?.snippet).toContain('TypeScript extends JavaScript by adding types & tooling')
  })

  it('respects maxResults', () => {
    expect(parseDuckDuckGoHtml(FIXTURE_HTML, 1)).toHaveLength(1)
    expect(parseDuckDuckGoHtml(FIXTURE_HTML, 2)).toHaveLength(2)
  })

  it('returns an empty array for HTML with no results', () => {
    expect(parseDuckDuckGoHtml('<html><body>no results</body></html>', 8)).toEqual([])
  })
})

describe('DuckDuckGoSearchProvider', () => {
  it('fetches the DDG endpoint and parses results with an injected fetch', async () => {
    const provider = new DuckDuckGoSearchProvider()
    let requestedUrl: string | undefined

    const fakeFetch = async (url: string): Promise<Response> => {
      requestedUrl = url
      return new Response(FIXTURE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    }

    const result = await provider.search(
      { query: 'vitest coverage', maxResults: 8, timeoutMs: 5000 },
      fakeFetch,
    )

    expect(result.outcome).toBe('ok')
    expect(result.results).toHaveLength(3)
    expect(requestedUrl).toContain('html.duckduckgo.com/html/')
    expect(requestedUrl).toContain(encodeURIComponent('vitest coverage'))
  })

  it('treats an anti-bot challenge page as a transport_error instead of "0 results"', async () => {
    const provider = new DuckDuckGoSearchProvider()
    const challengeHtml =
      '<html><body><form id="challenge-form" action="//duckduckgo.com/anomaly.js?sv=html&cc=botnet"></form></body></html>'
    const fakeFetch = async (): Promise<Response> =>
      new Response(challengeHtml, { status: 202, headers: { 'content-type': 'text/html' } })

    const result = await provider.search({ query: 'x', maxResults: 8, timeoutMs: 5000 }, fakeFetch)

    expect(result.outcome).toBe('transport_error')
    expect(result.reason).toMatch(/anti-automation challenge/)
  })

  it('reports a transport_error on a non-ok HTTP response', async () => {
    const provider = new DuckDuckGoSearchProvider()
    const fakeFetch = async (): Promise<Response> => new Response('', { status: 503 })

    const result = await provider.search({ query: 'x', maxResults: 8, timeoutMs: 5000 }, fakeFetch)

    expect(result.outcome).toBe('transport_error')
    expect(result.reason).toMatch(/503/)
  })

  it('reports a transport_error when the fetch throws', async () => {
    const provider = new DuckDuckGoSearchProvider()
    const fakeFetch = async (): Promise<Response> => {
      throw new Error('network down')
    }

    const result = await provider.search({ query: 'x', maxResults: 8, timeoutMs: 5000 }, fakeFetch)

    expect(result.outcome).toBe('transport_error')
    expect(result.reason).toMatch(/network down/)
  })

  it('times out slow providers', async () => {
    const provider = new DuckDuckGoSearchProvider()
    const fakeFetch = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response('', { status: 200 })), 2000)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('This operation was aborted'))
        })
      })

    const result = await provider.search({ query: 'x', maxResults: 8, timeoutMs: 50 }, fakeFetch)

    expect(result.outcome).toBe('transport_error')
    expect(result.reason).toMatch(/timed out/)
  })
})
