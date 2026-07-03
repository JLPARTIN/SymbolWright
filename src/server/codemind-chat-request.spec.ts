import { describe, expect, it } from 'vitest'

import {
  ChatRequestValidationError,
  parseChatRequestBody,
  parseRegisterRequestBody,
  parseResetRequestBody,
} from './codemind-chat-request.js'

describe('parseChatRequestBody', () => {
  it('parses a minimal valid request', () => {
    const parsed = parseChatRequestBody({
      providerId: 'anthropic',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(parsed.providerId).toBe('anthropic')
    expect(parsed.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(parsed.stream).toBe(false)
  })

  it('accepts "provider" as an alias for "providerId"', () => {
    const parsed = parseChatRequestBody({
      provider: 'openai',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(parsed.providerId).toBe('openai')
  })

  it('rejects an unknown provider', () => {
    expect(() =>
      parseChatRequestBody({ providerId: 'not-real', messages: [{ role: 'user', content: 'hi' }] }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects a missing or empty messages array', () => {
    expect(() => parseChatRequestBody({ providerId: 'openai', messages: [] })).toThrow(
      ChatRequestValidationError,
    )
    expect(() => parseChatRequestBody({ providerId: 'openai' })).toThrow(ChatRequestValidationError)
  })

  it('rejects a message with an invalid role', () => {
    expect(() =>
      parseChatRequestBody({
        providerId: 'openai',
        messages: [{ role: 'admin', content: 'hi' }],
      }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects a message with empty content', () => {
    expect(() =>
      parseChatRequestBody({ providerId: 'openai', messages: [{ role: 'user', content: '' }] }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects an oversized message', () => {
    expect(() =>
      parseChatRequestBody({
        providerId: 'openai',
        messages: [{ role: 'user', content: 'x'.repeat(40_000) }],
      }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects too many messages', () => {
    const messages = Array.from({ length: 201 }, () => ({ role: 'user', content: 'hi' }))
    expect(() => parseChatRequestBody({ providerId: 'openai', messages })).toThrow(
      ChatRequestValidationError,
    )
  })

  it('rejects a non-object body', () => {
    expect(() => parseChatRequestBody('not an object')).toThrow(ChatRequestValidationError)
    expect(() => parseChatRequestBody(null)).toThrow(ChatRequestValidationError)
    expect(() => parseChatRequestBody([])).toThrow(ChatRequestValidationError)
  })

  it('carries through optional fields and the stream flag', () => {
    const parsed = parseChatRequestBody({
      providerId: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'be terse',
      temperature: 0.2,
      maxTokens: 512,
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(parsed).toEqual({
      providerId: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'be terse',
      temperature: 0.2,
      maxTokens: 512,
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
  })
})

describe('parseRegisterRequestBody', () => {
  it('parses a full custom-provider registration', () => {
    const parsed = parseRegisterRequestBody({
      providerId: 'custom',
      baseUrl: 'https://my-model-host.example.com/v1',
      apiKey: 'sk-my-key',
      model: 'my-model',
      displayName: 'My Model Host',
      enabled: true,
    })

    expect(parsed).toEqual({
      providerId: 'custom',
      override: {
        baseUrl: 'https://my-model-host.example.com/v1',
        apiKey: 'sk-my-key',
        model: 'my-model',
        displayName: 'My Model Host',
        enabled: true,
      },
    })
  })

  it('requires providerId', () => {
    expect(() => parseRegisterRequestBody({ baseUrl: 'https://x.example.com' })).toThrow(
      ChatRequestValidationError,
    )
  })

  it('rejects wrong-typed fields', () => {
    expect(() => parseRegisterRequestBody({ providerId: 'custom', apiKey: 123 })).toThrow(
      ChatRequestValidationError,
    )
  })
})

describe('parseResetRequestBody', () => {
  it('requires providerId', () => {
    expect(() => parseResetRequestBody({})).toThrow(ChatRequestValidationError)
  })

  it('accepts a valid providerId', () => {
    expect(parseResetRequestBody({ providerId: 'custom' })).toEqual({ providerId: 'custom' })
  })
})
