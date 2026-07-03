import { describe, expect, it } from 'vitest'

import type { ProviderResolvedConfig } from '../providers/provider-gateway.types.js'
import {
  joinStreamUrl,
  parseAnthropicSseFrame,
  parseOpenAiCompatibleSseLine,
  streamProviderChat,
  supportsRealtimeStreaming,
} from './provider-chat-stream.js'
import type {
  ProviderStreamHttpRequest,
  ProviderStreamHttpResponse,
} from './provider-chat-stream.js'

async function* toChunks(pieces: readonly string[]): AsyncGenerator<string> {
  for (const piece of pieces) {
    yield piece
  }
}

async function drain(generator: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = []
  for await (const value of generator) {
    results.push(value)
  }
  return results
}

const OPENAI_CONFIG: ProviderResolvedConfig = {
  id: 'openai',
  displayName: 'OpenAI',
  enabled: true,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  defaultModel: 'gpt-4o-mini',
  capabilities: ['chat', 'streaming'],
}

const ANTHROPIC_CONFIG: ProviderResolvedConfig = {
  id: 'anthropic',
  displayName: 'Anthropic',
  enabled: true,
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test',
  defaultModel: 'claude-3-5-sonnet-latest',
  capabilities: ['chat', 'streaming'],
}

describe('supportsRealtimeStreaming', () => {
  it('reports google-gemini as not yet real-time streaming', () => {
    expect(supportsRealtimeStreaming('google-gemini')).toBe(false)
  })

  it('reports openai-compatible and anthropic providers as real-time streaming', () => {
    expect(supportsRealtimeStreaming('openai')).toBe(true)
    expect(supportsRealtimeStreaming('custom')).toBe(true)
    expect(supportsRealtimeStreaming('anthropic')).toBe(true)
  })
})

describe('joinStreamUrl', () => {
  it('joins a base url and suffix without doubling slashes', () => {
    expect(joinStreamUrl('https://api.example.com/v1/', '/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
    expect(joinStreamUrl('https://api.example.com/v1', '/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })
})

describe('parseOpenAiCompatibleSseLine', () => {
  it('extracts a text delta from a data line', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hello"}}]}'
    expect(parseOpenAiCompatibleSseLine(line)).toBe('hello')
  })

  it('ignores the terminal [DONE] sentinel and non-data lines', () => {
    expect(parseOpenAiCompatibleSseLine('data: [DONE]')).toBeUndefined()
    expect(parseOpenAiCompatibleSseLine('')).toBeUndefined()
    expect(parseOpenAiCompatibleSseLine('event: ping')).toBeUndefined()
  })

  it('ignores malformed JSON without throwing', () => {
    expect(parseOpenAiCompatibleSseLine('data: {not json')).toBeUndefined()
  })
})

describe('parseAnthropicSseFrame', () => {
  it('extracts a text delta from a content_block_delta frame', () => {
    const delta = parseAnthropicSseFrame(
      'content_block_delta',
      'data: {"delta":{"type":"text_delta","text":"hi"}}',
    )
    expect(delta).toBe('hi')
  })

  it('ignores other event types', () => {
    expect(
      parseAnthropicSseFrame('message_stop', 'data: {"delta":{"type":"text_delta","text":"hi"}}'),
    ).toBeUndefined()
    expect(parseAnthropicSseFrame(undefined, 'data: {}')).toBeUndefined()
  })
})

describe('streamProviderChat', () => {
  it('streams OpenAI-compatible deltas split across chunk boundaries', async () => {
    const chunks = toChunks([
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n',
    ])

    let capturedRequest: ProviderStreamHttpRequest | undefined
    const transport = {
      async requestStream(request: ProviderStreamHttpRequest): Promise<ProviderStreamHttpResponse> {
        capturedRequest = request
        return { status: 200, body: chunks }
      },
    }

    const results = await drain(
      streamProviderChat(OPENAI_CONFIG, { messages: [{ role: 'user', content: 'hi' }] }, transport),
    )

    expect(results.join('')).toBe('Hello world')
    expect(capturedRequest?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(capturedRequest?.headers['authorization']).toBe('Bearer sk-test')
    expect(JSON.parse(capturedRequest?.body ?? '{}')).toMatchObject({ stream: true })
  })

  it('streams Anthropic deltas using event + data frame pairs', async () => {
    const chunks = toChunks([
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hi"}}\n\n',
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":" there"}}\n\n',
      'event: message_stop\ndata: {}\n\n',
    ])

    const transport = {
      async requestStream(): Promise<ProviderStreamHttpResponse> {
        return { status: 200, body: chunks }
      },
    }

    const results = await drain(
      streamProviderChat(
        ANTHROPIC_CONFIG,
        { messages: [{ role: 'user', content: 'hi' }] },
        transport,
      ),
    )

    expect(results.join('')).toBe('Hi there')
  })

  it('throws when the upstream provider returns a non-2xx status', async () => {
    const transport = {
      async requestStream(): Promise<ProviderStreamHttpResponse> {
        return { status: 401, body: toChunks([]) }
      },
    }

    await expect(
      drain(
        streamProviderChat(
          OPENAI_CONFIG,
          { messages: [{ role: 'user', content: 'hi' }] },
          transport,
        ),
      ),
    ).rejects.toThrow('returned HTTP 401')
  })

  it('throws a clear error when no model is available', async () => {
    const { defaultModel: _defaultModel, ...rest } = OPENAI_CONFIG
    const configWithoutModel: ProviderResolvedConfig = rest
    const transport = {
      async requestStream(): Promise<ProviderStreamHttpResponse> {
        return { status: 200, body: toChunks([]) }
      },
    }

    await expect(
      drain(
        streamProviderChat(
          configWithoutModel,
          { messages: [{ role: 'user', content: 'hi' }] },
          transport,
        ),
      ),
    ).rejects.toThrow('requires a model')
  })
})
