import { describe, expect, it } from 'vitest'

import {
  PROVIDER_MESSAGE_ROLES,
  PROVIDER_STOP_REASONS,
  PROVIDER_STREAM_EVENT_TYPES,
  type LLMProvider,
  type ProviderCompletionOptions,
  type ProviderContentBlock,
  type ProviderMessage,
  type ProviderMessageRole,
  type ProviderStopReason,
  type ProviderStreamEvent,
  type ProviderStreamEventType,
  type ProviderTextContent,
  type ProviderTokenUsage,
  type ProviderToolDefinition,
  type ProviderToolResultContent,
  type ProviderToolUseContent,
} from './provider.types.js'

describe('provider.types', () => {
  describe('PROVIDER_MESSAGE_ROLES', () => {
    it('includes all expected roles', () => {
      expect(PROVIDER_MESSAGE_ROLES).toEqual(['user', 'assistant', 'tool_use', 'tool_result'])
    })

    it('is a const tuple', () => {
      expect(PROVIDER_MESSAGE_ROLES.length).toBe(4)
    })
  })

  describe('PROVIDER_STOP_REASONS', () => {
    it('includes all expected stop reasons', () => {
      expect(PROVIDER_STOP_REASONS).toEqual(['end_turn', 'tool_use', 'max_tokens', 'error'])
    })

    it('is a const tuple', () => {
      expect(PROVIDER_STOP_REASONS.length).toBe(4)
    })
  })

  describe('PROVIDER_STREAM_EVENT_TYPES', () => {
    it('includes all expected event types', () => {
      expect(PROVIDER_STREAM_EVENT_TYPES).toEqual([
        'text_delta',
        'tool_use_start',
        'tool_use_delta',
        'tool_use_end',
        'message_stop',
        'error',
      ])
    })

    it('is a const tuple', () => {
      expect(PROVIDER_STREAM_EVENT_TYPES.length).toBe(6)
    })
  })

  describe('ProviderMessage', () => {
    it('can represent a string content message', () => {
      const message: ProviderMessage = {
        role: 'user',
        content: 'Hello',
      }
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello')
    })

    it('can represent a block content message', () => {
      const textBlock: ProviderTextContent = { type: 'text', text: 'Hello' }
      const toolUseBlock: ProviderToolUseContent = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'read_file',
        input: { path: '/tmp/test.ts' },
      }
      const toolResultBlock: ProviderToolResultContent = {
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'file contents here',
        isError: false,
      }

      const blocks: readonly ProviderContentBlock[] = [textBlock, toolUseBlock, toolResultBlock]
      const message: ProviderMessage = { role: 'assistant', content: blocks }
      expect(Array.isArray(message.content)).toBe(true)
      expect((message.content as readonly ProviderContentBlock[]).length).toBe(3)
    })

    it('supports all message roles', () => {
      const roles: ProviderMessageRole[] = ['user', 'assistant', 'tool_use', 'tool_result']
      for (const role of roles) {
        const message: ProviderMessage = { role, content: 'test' }
        expect(message.role).toBe(role)
      }
    })
  })

  describe('ProviderToolDefinition', () => {
    it('has required fields', () => {
      const tool: ProviderToolDefinition = {
        name: 'read_file',
        description: 'Read a file from the filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The file path to read' },
          },
          required: ['path'],
        },
      }
      expect(tool.name).toBe('read_file')
      expect(tool.description).toContain('Read a file')
      expect(tool.inputSchema).toHaveProperty('properties')
    })
  })

  describe('ProviderTokenUsage', () => {
    it('has required fields and optional cache fields', () => {
      const usage: ProviderTokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
      }
      expect(usage.inputTokens).toBe(1000)
      expect(usage.outputTokens).toBe(500)
      expect(usage.cacheReadInputTokens).toBeUndefined()
      expect(usage.cacheCreationInputTokens).toBeUndefined()
    })

    it('supports cache fields', () => {
      const usage: ProviderTokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadInputTokens: 800,
        cacheCreationInputTokens: 200,
      }
      expect(usage.cacheReadInputTokens).toBe(800)
      expect(usage.cacheCreationInputTokens).toBe(200)
    })
  })

  describe('ProviderStreamEvent', () => {
    it('can represent text_delta', () => {
      const event: ProviderStreamEvent = { type: 'text_delta', text: 'Hello' }
      expect(event.type).toBe('text_delta')
    })

    it('can represent tool_use_start', () => {
      const event: ProviderStreamEvent = {
        type: 'tool_use_start',
        id: 'tool-1',
        name: 'read_file',
      }
      expect(event.type).toBe('tool_use_start')
    })

    it('can represent tool_use_delta', () => {
      const event: ProviderStreamEvent = {
        type: 'tool_use_delta',
        partialJson: '{"path":',
      }
      expect(event.type).toBe('tool_use_delta')
    })

    it('can represent tool_use_end', () => {
      const event: ProviderStreamEvent = {
        type: 'tool_use_end',
        id: 'tool-1',
        name: 'read_file',
        input: { path: '/tmp/test.ts' },
      }
      expect(event.type).toBe('tool_use_end')
    })

    it('can represent message_stop', () => {
      const event: ProviderStreamEvent = {
        type: 'message_stop',
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      }
      expect(event.type).toBe('message_stop')
    })

    it('can represent error', () => {
      const event: ProviderStreamEvent = {
        type: 'error',
        error: 'API rate limit exceeded',
      }
      expect(event.type).toBe('error')
    })

    it('supports all stop reasons', () => {
      const reasons: ProviderStopReason[] = ['end_turn', 'tool_use', 'max_tokens', 'error']
      for (const reason of reasons) {
        const event: ProviderStreamEvent = {
          type: 'message_stop',
          stopReason: reason,
          usage: { inputTokens: 0, outputTokens: 0 },
        }
        expect(event.type).toBe('message_stop')
        if (event.type === 'message_stop') {
          expect(event.stopReason).toBe(reason)
        }
      }
    })
  })

  describe('ProviderCompletionOptions', () => {
    it('all fields are optional', () => {
      const options: ProviderCompletionOptions = {}
      expect(options.model).toBeUndefined()
      expect(options.maxTokens).toBeUndefined()
      expect(options.systemPrompt).toBeUndefined()
      expect(options.temperature).toBeUndefined()
      expect(options.stopSequences).toBeUndefined()
    })

    it('supports all fields', () => {
      const options: ProviderCompletionOptions = {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        systemPrompt: 'You are a helpful assistant.',
        temperature: 0.7,
        stopSequences: ['STOP', 'END'],
      }
      expect(options.model).toBe('claude-sonnet-4-20250514')
      expect(options.maxTokens).toBe(4096)
      expect(options.systemPrompt).toContain('helpful')
      expect(options.temperature).toBe(0.7)
      expect(options.stopSequences).toEqual(['STOP', 'END'])
    })
  })

  describe('LLMProvider interface', () => {
    it('can be implemented with required fields', () => {
      const provider: LLMProvider = {
        providerId: 'test-provider',
        displayName: 'Test Provider',
        async *complete() {
          yield { type: 'text_delta' as const, text: 'Hello' }
          yield {
            type: 'message_stop' as const,
            stopReason: 'end_turn' as const,
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        },
      }
      expect(provider.providerId).toBe('test-provider')
      expect(provider.displayName).toBe('Test Provider')
    })

    it('complete returns AsyncIterable', async () => {
      const provider: LLMProvider = {
        providerId: 'test',
        displayName: 'Test',
        async *complete() {
          yield { type: 'text_delta' as const, text: 'Hello' }
          yield {
            type: 'message_stop' as const,
            stopReason: 'end_turn' as const,
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        },
      }

      const events: ProviderStreamEvent[] = []
      for await (const event of provider.complete([{ role: 'user', content: 'Hi' }])) {
        events.push(event)
      }

      expect(events).toHaveLength(2)
      expect(events[0]?.type).toBe('text_delta')
      expect(events[1]?.type).toBe('message_stop')
    })
  })

  describe('type discriminated union narrowing', () => {
    it('narrows ProviderStreamEvent by type', () => {
      const events: ProviderStreamEvent[] = [
        { type: 'text_delta', text: 'Hello' },
        { type: 'tool_use_start', id: 'tool-1', name: 'read_file' },
        { type: 'tool_use_delta', partialJson: '{}' },
        { type: 'tool_use_end', id: 'tool-1', name: 'read_file', input: {} },
        {
          type: 'message_stop',
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { type: 'error', error: 'test error' },
      ]

      const types: ProviderStreamEventType[] = events.map((e) => e.type)
      expect(types).toEqual([
        'text_delta',
        'tool_use_start',
        'tool_use_delta',
        'tool_use_end',
        'message_stop',
        'error',
      ])
    })

    it('narrows ProviderContentBlock by type', () => {
      const blocks: ProviderContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', id: 'tool-1', name: 'read_file', input: {} },
        { type: 'tool_result', toolUseId: 'tool-1', content: 'result' },
      ]

      for (const block of blocks) {
        if (block.type === 'text') {
          expect(block.text).toBe('Hello')
        } else if (block.type === 'tool_use') {
          expect(block.id).toBe('tool-1')
          expect(block.name).toBe('read_file')
        } else {
          expect(block.toolUseId).toBe('tool-1')
        }
      }
    })
  })
})
