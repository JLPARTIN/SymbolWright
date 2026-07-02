import { describe, expect, it } from 'vitest'

import type { LLMProvider, ProviderStreamEvent } from '../provider/provider.types.js'
import { createMemoryLlmAdapter } from './provider-llm-adapter.js'

function mockProvider(events: readonly ProviderStreamEvent[]): LLMProvider {
  return {
    providerId: 'mock',
    displayName: 'Mock Provider',
    async *complete() {
      for (const event of events) {
        yield event
      }
    },
  }
}

describe('createMemoryLlmAdapter', () => {
  it('accumulates text_delta events into a single generated string', async () => {
    const adapter = createMemoryLlmAdapter(
      mockProvider([
        { type: 'text_delta', text: 'Summary of ' },
        { type: 'text_delta', text: 'the session.' },
        {
          type: 'message_stop',
          stopReason: 'end_turn',
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
    )

    const result = await adapter.generate('Summarize this.')
    expect(result).toBe('Summary of the session.')
  })

  it('ignores non-text-delta events', async () => {
    const adapter = createMemoryLlmAdapter(
      mockProvider([
        { type: 'tool_use_start', id: 't1', name: 'read_file' },
        { type: 'text_delta', text: 'ok' },
      ]),
    )

    const result = await adapter.generate('go')
    expect(result).toBe('ok')
  })
})
