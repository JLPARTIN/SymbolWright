import { describe, expect, it } from 'vitest'

import { loadProviderGatewayConfig } from './provider-config.js'
import { ProviderGatewayError } from './provider-errors.js'
import { ProviderGateway } from './provider-gateway.js'
import type {
  ProviderHttpRequest,
  ProviderHttpResponse,
  ProviderHttpTransport,
} from './provider-gateway.types.js'

class RecordingTransport implements ProviderHttpTransport {
  public readonly requests: ProviderHttpRequest[] = []

  public constructor(private readonly response: ProviderHttpResponse) {}

  public async request(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    this.requests.push(request)
    return this.response
  }
}

describe('ProviderGateway', () => {
  it('routes an OpenAI-compatible request through the selected provider', async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        choices: [{ message: { content: 'OpenAI response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    })
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({ OPENAI_API_KEY: 'openai-secret' }),
      transport,
    })

    const result = await gateway.runWithProvider('openai', {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 100,
    })

    expect(result.providerId).toBe('openai')
    expect(result.text).toBe('OpenAI response')
    expect(result.usage?.totalTokens).toBe(15)
    expect(transport.requests[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(transport.requests[0]?.headers['authorization']).toBe('Bearer openai-secret')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}')).toMatchObject({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 100,
    })
  })

  it('maps Anthropic messages and parses text responses', async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        content: [{ type: 'text', text: 'Anthropic response' }],
        usage: { input_tokens: 4, output_tokens: 6 },
      },
    })
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({ ANTHROPIC_API_KEY: 'anthropic-secret' }),
      transport,
    })

    const result = await gateway.runWithProvider('anthropic', {
      model: 'claude-test',
      systemPrompt: 'Be useful',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.text).toBe('Anthropic response')
    expect(transport.requests[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(transport.requests[0]?.headers['x-api-key']).toBe('anthropic-secret')
    expect(JSON.parse(transport.requests[0]?.body ?? '{}')).toMatchObject({
      model: 'claude-test',
      system: 'Be useful',
      messages: [{ role: 'user', content: 'hello' }],
    })
  })

  it('maps Google Gemini requests and parses candidate text', async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }],
      },
    })
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({ GOOGLE_API_KEY: 'google-secret' }),
      transport,
    })

    const result = await gateway.runWithProvider('google-gemini', {
      model: 'gemini-test',
      systemPrompt: 'Be exact',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
    })

    expect(result.text).toBe('Gemini response')
    expect(transport.requests[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent?key=google-secret',
    )
    expect(JSON.parse(transport.requests[0]?.body ?? '{}')).toMatchObject({
      systemInstruction: { parts: [{ text: 'Be exact' }] },
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: { temperature: 0.2 },
    })
  })

  it('reports provider status without leaking credentials', () => {
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({ OPENAI_API_KEY: 'openai-secret' }),
      transport: new RecordingTransport({ status: 200, headers: {}, body: {} }),
    })

    const redacted = gateway.getRedactedConfig()
    const statuses = gateway.getProviderStatuses()

    expect(JSON.stringify(redacted)).not.toContain('openai-secret')
    expect(statuses.find((status) => status.providerId === 'openai')?.status).toBe('configured')
    expect(statuses.find((status) => status.providerId === 'anthropic')?.status).toBe(
      'missing_credentials',
    )
  })

  it('falls back when the primary provider is missing credentials', async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: { choices: [{ message: { content: 'Fallback response' } }] },
    })
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({
        SYMBOLWRIGHT_PROVIDER: 'anthropic',
        SYMBOLWRIGHT_PROVIDER_FALLBACKS: 'openai',
        OPENAI_API_KEY: 'openai-secret',
      }),
      transport,
    })

    const result = await gateway.run({ messages: [{ role: 'user', content: 'hello' }] })

    expect(result.providerId).toBe('openai')
    expect(result.text).toBe('Fallback response')
    expect(transport.requests).toHaveLength(1)
  })

  it('throws a normalized missing credentials error', async () => {
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({}),
      transport: new RecordingTransport({ status: 200, headers: {}, body: {} }),
    })

    await expect(
      gateway.runWithProvider('openai', { messages: [{ role: 'user', content: 'hello' }] }),
    ).rejects.toMatchObject({ code: 'MISSING_CREDENTIALS' })
  })

  it('throws a normalized HTTP error', async () => {
    const gateway = new ProviderGateway({
      config: loadProviderGatewayConfig({ OPENAI_API_KEY: 'openai-secret' }),
      transport: new RecordingTransport({ status: 500, headers: {}, body: { error: 'failed' } }),
    })

    await expect(
      gateway.runWithProvider('openai', { messages: [{ role: 'user', content: 'hello' }] }),
    ).rejects.toBeInstanceOf(ProviderGatewayError)
  })
})
