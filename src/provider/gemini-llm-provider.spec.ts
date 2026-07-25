import { describe, expect, it } from 'vitest'

import {
  createGeminiLlmProvider,
  type GeminiStreamHttpRequest,
  type GeminiStreamHttpResponse,
  type GeminiStreamTransport,
} from './gemini-llm-provider.js'
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

class RecordingTransport implements GeminiStreamTransport {
  public lastRequest: GeminiStreamHttpRequest | undefined
  public constructor(
    private readonly status: number,
    private readonly chunks: readonly string[],
  ) {}

  public async request(req: GeminiStreamHttpRequest): Promise<GeminiStreamHttpResponse> {
    this.lastRequest = req
    return { status: this.status, body: toChunks(this.chunks) }
  }
}

const TOOL: ProviderToolDefinition = {
  name: 'read_file',
  description: 'Read a file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
}

describe('createGeminiLlmProvider', () => {
  it('streams plain text deltas and a final message_stop with usage', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2}}\n\n',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
      { type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 2 } },
    ])
    expect(transport.lastRequest?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=gem-test',
    )
    const body = JSON.parse(transport.lastRequest?.body ?? '{}')
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }])
  })

  it('emits a complete tool call as soon as one chunk contains it (no incremental accumulation needed)', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"call_1","name":"read_file","args":{"path":"a.txt"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":9}}\n\n',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'read a.txt' }], [TOOL]))

    expect(events).toEqual([
      { type: 'tool_use_start', id: 'call_1', name: 'read_file' },
      { type: 'tool_use_end', id: 'call_1', name: 'read_file', input: { path: 'a.txt' } },
      { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 5, outputTokens: 9 } },
    ])

    const body = JSON.parse(transport.lastRequest?.body ?? '{}')
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          { name: 'read_file', description: 'Read a file', parameters: TOOL.inputSchema },
        ],
      },
    ])
  })

  it('synthesizes an id when functionCall.id is absent', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"read_file","args":{"path":"a.txt"}}}]}}]}\n\n',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
      },
      transport,
    )

    const events = await drain(provider.complete([{ role: 'user', content: 'read a.txt' }], [TOOL]))
    expect(events[0]).toMatchObject({ type: 'tool_use_start', name: 'read_file' })
    expect((events[0] as { id: string }).id.length).toBeGreaterThan(0)
  })

  it('serializes prior assistant tool_use and tool_result messages into Gemini shape, correlating name by id', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"candidates":[{"content":{"parts":[{"text":"done"}]},"finishReason":"STOP"}]}\n\n',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
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
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'be terse' }] })
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'read a.txt' }] },
      {
        role: 'model',
        parts: [{ functionCall: { id: 'call_1', name: 'read_file', args: { path: 'a.txt' } } }],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: { output: 'file contents' },
            },
          },
        ],
      },
    ])
  })

  it('marks a failed tool result with a response.error key', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
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
        content: [
          { type: 'tool_result', toolUseId: 'call_1', content: 'not found', isError: true },
        ],
      },
    ]

    await drain(provider.complete(priorMessages, [TOOL]))
    const body = JSON.parse(transport.lastRequest?.body ?? '{}')
    expect(body.contents.at(-1)).toEqual({
      role: 'user',
      parts: [
        { functionResponse: { id: 'call_1', name: 'read_file', response: { error: 'not found' } } },
      ],
    })
  })

  it('yields an error event instead of throwing when no model is available', async () => {
    const transport = new RecordingTransport(200, [])
    const provider = createGeminiLlmProvider(
      { baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'gem-test' },
      transport,
    )
    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events).toEqual([{ type: 'error', error: 'Google Gemini requires a model' }])
  })

  it('yields an error event on a non-2xx response instead of throwing', async () => {
    const transport = new RecordingTransport(401, [])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
      },
      transport,
    )
    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events).toEqual([{ type: 'error', error: 'Google Gemini returned HTTP 401' }])
  })

  it('includes the provider error body detail in the yielded error message', async () => {
    const transport = new RecordingTransport(400, [
      '{"error":{"code":400,"message":"API key not valid","status":"INVALID_ARGUMENT"}}',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
      },
      transport,
    )
    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events).toEqual([
      { type: 'error', error: 'Google Gemini returned HTTP 400: API key not valid' },
    ])
  })

  it('maps MAX_TOKENS finish reason to max_tokens when no tool call occurred', async () => {
    const transport = new RecordingTransport(200, [
      'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]},"finishReason":"MAX_TOKENS"}]}\n\n',
    ])
    const provider = createGeminiLlmProvider(
      {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'gem-test',
        model: 'gemini-1.5-flash',
      },
      transport,
    )
    const events = await drain(provider.complete([{ role: 'user', content: 'hi' }]))
    expect(events.at(-1)).toMatchObject({ stopReason: 'max_tokens' })
  })
})
