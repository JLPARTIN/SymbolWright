import { afterEach, describe, expect, it } from 'vitest'

import type {
  ProviderHttpRequest,
  ProviderHttpResponse,
  ProviderHttpTransport,
} from '../providers/provider-gateway.types.js'
import {
  assertChatServerCanStart,
  buildChatServerWarnings,
  ChatServerConfigError,
  startChatServer,
  type StartedChatServer,
} from './codemind-chat-server.js'
import type { ProviderStreamHttpResponse, ProviderStreamTransport } from './provider-chat-stream.js'
import { UnlimitedRateLimiter, type RateLimiter } from './rate-limiter.js'

const API_KEY = 'test-codemind-key'

class FakeHttpTransport implements ProviderHttpTransport {
  public lastRequest: ProviderHttpRequest | undefined
  public async request(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    this.lastRequest = request
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { choices: [{ message: { content: 'hello from fake provider' } }] },
    }
  }
}

class FakeStreamTransport implements ProviderStreamTransport {
  public async requestStream(): Promise<ProviderStreamHttpResponse> {
    async function* chunks(): AsyncGenerator<string> {
      yield 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'
      yield 'data: {"choices":[{"delta":{"content":" there"}}]}\n\n'
      yield 'data: [DONE]\n\n'
    }
    return { status: 200, body: chunks() }
  }
}

class DenyingRateLimiter implements RateLimiter {
  public consume(): boolean {
    return false
  }
}

let started: StartedChatServer | undefined

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
})

async function launch(overrides: Partial<Parameters<typeof startChatServer>[0]> = {}) {
  started = await startChatServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    env: {},
    transport: new FakeHttpTransport(),
    streamTransport: new FakeStreamTransport(),
    rateLimiter: new UnlimitedRateLimiter(),
    ...overrides,
  })
  return started
}

function auth(key: string = API_KEY): Record<string, string> {
  return { authorization: `Bearer ${key}` }
}

describe('assertChatServerCanStart', () => {
  it('throws when the api key is blank', () => {
    expect(() => assertChatServerCanStart({ apiKey: '' })).toThrow(ChatServerConfigError)
    expect(() => assertChatServerCanStart({ apiKey: '   ' })).toThrow(ChatServerConfigError)
  })

  it('accepts a non-blank api key', () => {
    expect(() => assertChatServerCanStart({ apiKey: 'k' })).not.toThrow()
  })
})

describe('buildChatServerWarnings', () => {
  it('warns when binding non-loopback without TLS', () => {
    const warnings = buildChatServerWarnings({ host: '0.0.0.0' })
    expect(warnings.length).toBe(1)
  })

  it('does not warn for loopback hosts', () => {
    expect(buildChatServerWarnings({ host: '127.0.0.1' })).toEqual([])
  })

  it('does not warn when TLS files are configured', () => {
    expect(
      buildChatServerWarnings({ host: '0.0.0.0', tlsCertFile: 'cert.pem', tlsKeyFile: 'key.pem' }),
    ).toEqual([])
  })
})

describe('codemind chat server routes', () => {
  it('exposes /api/health without auth', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok' })
  })

  it('answers favicon requests without requiring auth or logging as unauthorized', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/favicon.ico`)
    expect(response.status).toBe(204)
  })

  it('serves the chat UI at /', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('CodeMind Chat')
  })

  it('rejects unauthenticated requests to /api/providers', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/providers`)
    expect(response.status).toBe(401)
  })

  it('rejects an incorrect bearer key', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/providers`, { headers: auth('wrong-key') })
    expect(response.status).toBe(401)
  })

  it('lists the provider catalog for an authenticated caller', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/providers`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { catalog: readonly { id: string }[] }
    expect(body.catalog.some((entry) => entry.id === 'custom')).toBe(true)
  })

  it('registers a runtime override for the custom provider and reflects it back redacted', async () => {
    const server = await launch()
    const registerResponse = await fetch(`${server.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        baseUrl: 'https://my-model-host.example.com/v1',
        apiKey: 'sk-my-key',
        model: 'my-model',
      }),
    })
    expect(registerResponse.status).toBe(200)

    const providersResponse = await fetch(`${server.url}/api/providers`, { headers: auth() })
    const body = (await providersResponse.json()) as {
      redactedConfig: { providers: readonly { id: string; baseUrl: string; apiKey: string }[] }
    }
    const custom = body.redactedConfig.providers.find((p) => p.id === 'custom')
    expect(custom?.baseUrl).toBe('https://my-model-host.example.com/v1')
    expect(custom?.apiKey).toBe('configured')
  })

  it('resets a provider override back to defaults', async () => {
    const server = await launch()
    await fetch(`${server.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'custom', apiKey: 'sk-my-key' }),
    })
    const resetResponse = await fetch(`${server.url}/api/providers/reset`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'custom' }),
    })
    expect(resetResponse.status).toBe(200)

    const providersResponse = await fetch(`${server.url}/api/providers`, { headers: auth() })
    const body = (await providersResponse.json()) as {
      redactedConfig: { providers: readonly { id: string; apiKey: string }[] }
    }
    expect(body.redactedConfig.providers.find((p) => p.id === 'custom')?.apiKey).toBe('missing')
  })

  it('rejects invalid provider registration input', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'not-a-real-provider' }),
    })
    expect(response.status).toBe(400)
  })

  it('runs a non-streaming chat turn through the injected transport', async () => {
    const server = await launch()
    await fetch(`${server.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'custom', apiKey: 'sk-my-key', model: 'my-model' }),
    })

    const response = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { reply: string }
    expect(body.reply).toBe('hello from fake provider')
  })

  it('streams a chat turn as server-sent events', async () => {
    const server = await launch()
    await fetch(`${server.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'custom', apiKey: 'sk-my-key', model: 'my-model' }),
    })

    const response = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await response.text()
    expect(text).toContain('data: {"delta":"Hi"}')
    expect(text).toContain('data: {"delta":" there"}')
    expect(text).toContain('event: done')
  })

  it('rejects a malformed chat request body', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'custom', messages: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('rate-limits authenticated requests once the limiter denies', async () => {
    const server = await launch({ rateLimiter: new DenyingRateLimiter() })
    const response = await fetch(`${server.url}/api/providers`, { headers: auth() })
    expect(response.status).toBe(429)
  })

  it('answers CORS preflight requests when an origin is configured', async () => {
    const server = await launch({ corsOrigin: 'https://my-frontend.example.com' })
    const response = await fetch(`${server.url}/api/chat`, { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://my-frontend.example.com',
    )
  })

  it('returns 404 for unknown API routes', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/does-not-exist`, { headers: auth() })
    expect(response.status).toBe(404)
  })
})

describe('browser-only mode: /api/local-status', () => {
  it('rejects unauthenticated requests', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/local-status`)
    expect(response.status).toBe(401)
  })

  it('returns the injected local diagnostics view for an authenticated caller with no provider required', async () => {
    const fakeStatus = {
      overallState: 'pass' as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      cards: [{ label: 'Doctor health', value: 'HEALTHY', state: 'pass' as const }],
      scripts: [],
    }
    const server = await launch({ localStatusProvider: async () => fakeStatus })
    const response = await fetch(`${server.url}/api/local-status`, { headers: auth() })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(fakeStatus)
  })
})
