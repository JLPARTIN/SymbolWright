import { afterEach, describe, expect, it } from 'vitest'

import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'
import { startUnifiedServer, type StartedUnifiedServer } from './unified-server.js'

const API_KEY = 'test-symbolwright-key'

let started: StartedUnifiedServer | undefined

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
})

async function launch() {
  started = await startUnifiedServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    env: {},
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}` }
}

describe('GET /', () => {
  it('serves the unified app shell', async () => {
    const server = await launch()
    const response = await fetch(server.url)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<title>SymbolWright</title>')
    expect(html).toContain('data-view="workspace"')
    expect(html).toContain('data-view="agent"')
  })
})

describe('GET /workspace', () => {
  it('redirects to the workspace view inside the shell', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/workspace`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/#/workspace')
  })

  it('redirects the trailing-slash form too', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/workspace/`, { redirect: 'manual' })
    expect(response.status).toBe(302)
  })
})

describe('GET /api/health', () => {
  it('is public', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/health`)
    expect(response.status).toBe(200)
  })
})

describe('GET /api/status', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/status`)
    expect(response.status).toBe(401)
  })

  it('returns the same status payload /api/local-status serves', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/status`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { overallState: string; cards: unknown[] }
    expect(typeof body.overallState).toBe('string')
    expect(Array.isArray(body.cards)).toBe(true)
  })
})

describe('Workspace API stays unauthenticated', () => {
  it('GET /api/workspace/languages works without a Bearer header', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/workspace/languages`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { languages: unknown[] }
    expect(Array.isArray(body.languages)).toBe(true)
  })

  it('POST /api/workspace/run works without a Bearer header', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/workspace/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ languageId: 'typescript', code: 'console.log(1)' }),
    })
    expect(response.status).toBe(200)
  })

  it('POST /api/workspace/intelligence works without a Bearer header', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/workspace/intelligence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'review', code: 'const a = 1', sourceLanguageId: 'typescript' }),
    })
    expect(response.status).toBe(200)
  })
})

describe('Provider/chat/agent/registry API stays authenticated', () => {
  it('GET /api/providers requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/providers`)
    expect(response.status).toBe(401)
  })

  it('POST /api/agent requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'anthropic', message: 'hi' }),
    })
    expect(response.status).toBe(401)
  })

  it('GET /api/tools requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/tools`)
    expect(response.status).toBe(401)
  })
})
