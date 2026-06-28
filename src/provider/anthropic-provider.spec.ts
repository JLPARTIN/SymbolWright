import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ProviderStreamEvent } from './provider.types.js'

function makeMockStream(events: unknown[], finalMessage: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event
      }
    },
    finalMessage: vi.fn().mockResolvedValue(finalMessage),
  }
}

const mockStreamFn = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      stream: mockStreamFn,
    }
  },
}))

// Import after mock setup
const { createAnthropicProvider } = await import('./anthropic-provider.js')

describe('anthropic-provider', () => {
  beforeEach(() => {
    mockStreamFn.mockReset()
  })

  describe('createAnthropicProvider', () => {
    it('returns a provider with correct id and display name', () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })
      expect(provider.providerId).toBe('anthropic')
      expect(provider.displayName).toBe('Anthropic Claude')
    })

    it('accepts optional config fields', () => {
      const provider = createAnthropicProvider({
        apiKey: 'test-key',
        model: 'claude-haiku-3-20240307',
        maxTokens: 4096,
        baseURL: 'https://custom.api.example.com',
      })
      expect(provider.providerId).toBe('anthropic')
    })
  })

  describe('streaming', () => {
    it('streams text_delta events from text content blocks', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      const finalMessage = {
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: 'text', text: 'Hello world' }],
      }

      mockStreamFn.mockReturnValue(
        makeMockStream(
          [
            { type: 'content_block_start', content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
            { type: 'content_block_stop' },
            { type: 'message_stop' },
          ],
          finalMessage,
        ),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }])) {
        events.push(event)
      }

      expect(events).toHaveLength(3)
      expect(events[0]).toEqual({ type: 'text_delta', text: 'Hello' })
      expect(events[1]).toEqual({ type: 'text_delta', text: ' world' })
      expect(events[2]).toEqual({
        type: 'message_stop',
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      })
    })

    it('streams tool_use events', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      const finalMessage = {
        stop_reason: 'tool_use',
        usage: { input_tokens: 200, output_tokens: 100 },
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'read_file',
            input: { path: '/test.ts' },
          },
        ],
      }

      mockStreamFn.mockReturnValue(
        makeMockStream(
          [
            {
              type: 'content_block_start',
              content_block: { type: 'tool_use', id: 'tool-1', name: 'read_file' },
            },
            {
              type: 'content_block_delta',
              delta: { type: 'input_json_delta', partial_json: '{"path":' },
            },
            {
              type: 'content_block_delta',
              delta: { type: 'input_json_delta', partial_json: '"/test.ts"}' },
            },
            { type: 'content_block_stop' },
            { type: 'message_stop' },
          ],
          finalMessage,
        ),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Read test.ts' }])) {
        events.push(event)
      }

      expect(events).toHaveLength(5)
      expect(events[0]).toEqual({
        type: 'tool_use_start',
        id: 'tool-1',
        name: 'read_file',
      })
      expect(events[1]).toEqual({ type: 'tool_use_delta', partialJson: '{"path":' })
      expect(events[2]).toEqual({ type: 'tool_use_delta', partialJson: '"/test.ts"}' })
      expect(events[3]).toEqual({
        type: 'tool_use_end',
        id: 'tool-1',
        name: 'read_file',
        input: { path: '/test.ts' },
      })
      expect(events[4]).toEqual({
        type: 'message_stop',
        stopReason: 'tool_use',
        usage: { inputTokens: 200, outputTokens: 100 },
      })
    })

    it('passes tools to the SDK', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      mockStreamFn.mockReturnValue(
        makeMockStream([{ type: 'message_stop' }], {
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [],
        }),
      )

      const tools = [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: {
            type: 'object' as const,
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ]

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }], tools)) {
        events.push(event)
      }

      expect(mockStreamFn).toHaveBeenCalledTimes(1)
      const callArgs = mockStreamFn.mock.calls[0]?.[0] as Record<string, unknown>
      expect(callArgs['tools']).toEqual([
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ])
    })

    it('passes system prompt and temperature to the SDK', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      mockStreamFn.mockReturnValue(
        makeMockStream([{ type: 'message_stop' }], {
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [],
        }),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }], [], {
        systemPrompt: 'Be helpful.',
        temperature: 0.5,
      })) {
        events.push(event)
      }

      const callArgs = mockStreamFn.mock.calls[0]?.[0] as Record<string, unknown>
      expect(callArgs['system']).toBe('Be helpful.')
      expect(callArgs['temperature']).toBe(0.5)
    })

    it('uses default model and maxTokens', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      mockStreamFn.mockReturnValue(
        makeMockStream([{ type: 'message_stop' }], {
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [],
        }),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }])) {
        events.push(event)
      }

      const callArgs = mockStreamFn.mock.calls[0]?.[0] as Record<string, unknown>
      expect(callArgs['model']).toBe('claude-sonnet-4-20250514')
      expect(callArgs['max_tokens']).toBe(8192)
    })

    it('overrides model and maxTokens from options', async () => {
      const provider = createAnthropicProvider({
        apiKey: 'test-key',
        model: 'claude-haiku-3-20240307',
        maxTokens: 2048,
      })

      mockStreamFn.mockReturnValue(
        makeMockStream([{ type: 'message_stop' }], {
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [],
        }),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }], [], {
        model: 'claude-opus-4-20250514',
        maxTokens: 4096,
      })) {
        events.push(event)
      }

      const callArgs = mockStreamFn.mock.calls[0]?.[0] as Record<string, unknown>
      expect(callArgs['model']).toBe('claude-opus-4-20250514')
      expect(callArgs['max_tokens']).toBe(4096)
    })

    it('maps user and tool_result roles to Anthropic user role', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      mockStreamFn.mockReturnValue(
        makeMockStream([{ type: 'message_stop' }], {
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [],
        }),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        {
          role: 'tool_result',
          content: [{ type: 'tool_result', toolUseId: 'tool-1', content: 'result' }],
        },
      ])) {
        events.push(event)
      }

      const callArgs = mockStreamFn.mock.calls[0]?.[0] as Record<string, unknown>
      const messages = callArgs['messages'] as Array<{ role: string }>
      expect(messages[0]?.role).toBe('user')
      expect(messages[1]?.role).toBe('assistant')
      expect(messages[2]?.role).toBe('user')
    })

    it('includes cache usage when present', async () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })

      mockStreamFn.mockReturnValue(
        makeMockStream([{ type: 'message_stop' }], {
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 80,
            cache_creation_input_tokens: 20,
          },
          content: [],
        }),
      )

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }])) {
        events.push(event)
      }

      const stopEvent = events.find((e) => e.type === 'message_stop')
      expect(stopEvent).toBeDefined()
      if (stopEvent?.type === 'message_stop') {
        expect(stopEvent.usage.cacheReadInputTokens).toBe(80)
        expect(stopEvent.usage.cacheCreationInputTokens).toBe(20)
      }
    })
  })

  describe('message format mapping', () => {
    it('provider accepts string content messages', () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })
      const messages = [{ role: 'user' as const, content: 'Hello' }]
      expect(() => provider.complete(messages)).not.toThrow()
    })

    it('provider accepts block content messages', () => {
      const provider = createAnthropicProvider({ apiKey: 'test-key' })
      const messages = [
        {
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'Let me read that file.' },
            {
              type: 'tool_use' as const,
              id: 'tool-1',
              name: 'read_file',
              input: { path: '/test.ts' },
            },
          ],
        },
      ]
      expect(() => provider.complete(messages)).not.toThrow()
    })
  })
})
