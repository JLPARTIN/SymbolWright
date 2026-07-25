import { describe, expect, it } from 'vitest'

import {
  createOpenAiCompatibleLlmProvider,
  type OpenAiCompatibleStreamHttpRequest,
  type OpenAiCompatibleStreamHttpResponse,
  type OpenAiCompatibleStreamTransport,
} from './openai-compatible-llm-provider.js'
import type {
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolDefinition,
} from './provider.types.js'

async function* toChunks(pieces: readonly string[]): AsyncGenerator<string> {
  for (const piece of pieces) yield piece
}

async function drain(stream: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const events: ProviderStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

class RecordingTransport implements OpenAiCompatibleStreamTransport {
  public lastRequest: OpenAiCompatibleStreamHttpRequest | undefined
  public constructor(
    private readonly status: number,
    private readonly chunks: readonly string[],
  ) {}

  public async request(
    req: OpenAiCompatibleStreamHttpRequest,
  ): Promise<OpenAiCompatibleStreamHttpResponse> {
    this.lastRequest = req
    return { status: this.status, body: toChunks(this.chunks) }
  }
}

const TOOL: ProviderToolDefinition = {
  name: 'read_file',
  description: 'Read a file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
}

describe('createOpenAiCompatibleLlmProvider', () => {
  it('streams plain text deltas and a final message_stop with usage', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ])
    const provider = createOpenAiCompatibleLlmProvider(
      {
        providerId: 'openai',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-x',
        model: 'gpt-4o-mini',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
      { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 2 } },
    ])
    expect(transport.lastRequest?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(transport.lastRequest?.headers['authorization']).toBe('Bearer sk-x')
    const body = JSON.parse(transport.lastRequest?.body ?? '{}')
    expect(body).toMatchObject({ model: 'gpt-4o-mini', stream: true })
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('assembles a streamed tool call split across many chunks', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.txt\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":9}}\n\n',
      'data: [DONE]\n\n',
    ])
    const provider = createOpenAiCompatibleLlmProvider(
      {
        providerId: 'openai',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-x',
        model: 'gpt-4o-mini',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'read a.txt' }], [TOOL]))

    expect(events).toContainEqual({ type: 'tool_use_start', id: 'call_1', name: 'read_file' })
    expect(events).toContainEqual({
      type: 'tool_use_end',
      id: 'call_1',
      name: 'read_file',
      input: { path: 'a.txt' },
    })
    expect(events.at(-1)).toEqual({
      type: 'message_stop',
      stopReason: 'tool_use',
      usage: { inputTokens: 5, outputTokens: 9 },
    })

    const body = JSON.parse(transport.lastRequest?.body ?? '{}')
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: { name: 'read_file', description: 'Read a file', parameters: TOOL.inputSchema },
      },
    ])
  })

  it('serializes prior assistant tool_use and tool_result messages into OpenAI shape', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ])
    const provider = createOpenAiCompatibleLlmProvider(
      {
        providerId: 'custom',
        displayName: 'Custom',
        baseUrl: 'http://localhost:8000/v1',
        model: 'local-model',
      },
      transport,
    )

    const priorMessages: ProviderMessage[] = [
      { role: 'user', content: 'read a.txt' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.txt' } }],
      },
      {
        role: 'tool_result',
        content: [{ type: 'tool_result', toolUseId: 'call_1', content: 'file contents' }],
      },
    ]

    await drain(provider.complete(priorMessages, [TOOL], { systemPrompt: 'be terse' }))

    const body = JSON.parse(transport.lastRequest?.body ?? '{}')
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'read a.txt' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents' },
    ])
  })

  it('yields an error event instead of throwing when no model is available', async () => {
    const transport = new RecordingTransport(200, [])
    const provider = createOpenAiCompatibleLlmProvider(
      { providerId: 'custom', displayName: 'Custom', baseUrl: 'http://localhost:8000/v1' },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events).toEqual([{ type: 'error', error: 'Custom requires a model' }])
  })

  it('yields an error event on a non-2xx response instead of throwing', async () => {
    const transport = new RecordingTransport(401, [])
    const provider = createOpenAiCompatibleLlmProvider(
      {
        providerId: 'openai',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events).toEqual([{ type: 'error', error: 'OpenAI returned HTTP 401' }])
  })

  it('includes the provider error body detail in the yielded error message', async () => {
    const transport = new RecordingTransport(401, [
      '{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}',
    ])
    const provider = createOpenAiCompatibleLlmProvider(
      {
        providerId: 'openai',
        displayName: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events).toEqual([
      { type: 'error', error: 'OpenAI returned HTTP 401: Incorrect API key provided' },
    ])
  })
})
