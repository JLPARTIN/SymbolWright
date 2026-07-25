import { describe, expect, it } from 'vitest'

import { ChatRequestValidationError } from './symbolwright-chat-request.js'
import { parseAgentRequestBody } from './symbolwright-agent-request.js'

describe('parseAgentRequestBody', () => {
  it('parses a minimal valid request with sensible defaults', () => {
    const parsed = parseAgentRequestBody({ providerId: 'anthropic', message: 'read package.json' })

    expect(parsed.providerId).toBe('anthropic')
    expect(parsed.message).toBe('read package.json')
    expect(parsed.mode).toBe('READ_ONLY')
    expect(parsed.maxIterations).toBe(25)
    expect(parsed.stream).toBe(true)
    expect(parsed.priorMessages).toBeUndefined()
  })

  it('accepts "provider" as an alias for "providerId"', () => {
    expect(parseAgentRequestBody({ provider: 'openai', message: 'hi' }).providerId).toBe('openai')
  })

  it('rejects an unknown provider', () => {
    expect(() => parseAgentRequestBody({ providerId: 'not-real', message: 'hi' })).toThrow(
      ChatRequestValidationError,
    )
  })

  it('rejects a missing or blank message', () => {
    expect(() => parseAgentRequestBody({ providerId: 'openai' })).toThrow(
      ChatRequestValidationError,
    )
    expect(() => parseAgentRequestBody({ providerId: 'openai', message: '   ' })).toThrow(
      ChatRequestValidationError,
    )
  })

  it('accepts an explicit runtime mode and rejects an invalid one', () => {
    expect(
      parseAgentRequestBody({ providerId: 'openai', message: 'hi', mode: 'APPROVED_EXECUTION' })
        .mode,
    ).toBe('APPROVED_EXECUTION')
    expect(() =>
      parseAgentRequestBody({ providerId: 'openai', message: 'hi', mode: 'SUPER_MODE' }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects maxIterations outside the allowed range', () => {
    expect(() =>
      parseAgentRequestBody({ providerId: 'openai', message: 'hi', maxIterations: 0 }),
    ).toThrow(ChatRequestValidationError)
    expect(() =>
      parseAgentRequestBody({ providerId: 'openai', message: 'hi', maxIterations: 1000 }),
    ).toThrow(ChatRequestValidationError)
  })

  it('parses string-content priorMessages', () => {
    const parsed = parseAgentRequestBody({
      providerId: 'openai',
      message: 'more',
      priorMessages: [
        { role: 'user', content: 'read a.txt' },
        { role: 'assistant', content: 'ok' },
      ],
    })
    expect(parsed.priorMessages).toEqual([
      { role: 'user', content: 'read a.txt' },
      { role: 'assistant', content: 'ok' },
    ])
  })

  it('parses content-block priorMessages (tool_use and tool_result)', () => {
    const parsed = parseAgentRequestBody({
      providerId: 'openai',
      message: 'more',
      priorMessages: [
        { role: 'user', content: 'read a.txt' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.txt' } },
          ],
        },
        {
          role: 'tool_result',
          content: [
            { type: 'tool_result', toolUseId: 'call_1', content: 'file contents', isError: false },
          ],
        },
      ],
    })

    expect(parsed.priorMessages).toEqual([
      { role: 'user', content: 'read a.txt' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.txt' } }],
      },
      {
        role: 'tool_result',
        content: [{ type: 'tool_result', toolUseId: 'call_1', content: 'file contents' }],
      },
    ])
  })

  it('rejects a malformed content block', () => {
    expect(() =>
      parseAgentRequestBody({
        providerId: 'openai',
        message: 'more',
        priorMessages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'x' }] }],
      }),
    ).toThrow(ChatRequestValidationError)

    expect(() =>
      parseAgentRequestBody({
        providerId: 'openai',
        message: 'more',
        priorMessages: [{ role: 'assistant', content: [{ type: 'not-a-real-type' }] }],
      }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects a priorMessages entry with an invalid role', () => {
    expect(() =>
      parseAgentRequestBody({
        providerId: 'openai',
        message: 'more',
        priorMessages: [{ role: 'system', content: 'nope' }],
      }),
    ).toThrow(ChatRequestValidationError)
  })

  it('rejects a non-array priorMessages', () => {
    expect(() =>
      parseAgentRequestBody({ providerId: 'openai', message: 'hi', priorMessages: 'nope' }),
    ).toThrow(ChatRequestValidationError)
  })

  it('carries through optional model/systemPrompt/temperature/maxTokens and stream=false', () => {
    const parsed = parseAgentRequestBody({
      providerId: 'openai',
      message: 'hi',
      model: 'gpt-4o-mini',
      systemPrompt: 'be terse',
      temperature: 0.1,
      maxTokens: 2048,
      stream: false,
    })
    expect(parsed).toMatchObject({
      model: 'gpt-4o-mini',
      systemPrompt: 'be terse',
      temperature: 0.1,
      maxTokens: 2048,
      stream: false,
    })
  })
})
