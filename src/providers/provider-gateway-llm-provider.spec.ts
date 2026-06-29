import { describe, expect, it } from 'vitest'

import type { ProviderStreamEvent } from '../provider/provider.types.js'
import { loadProviderGatewayConfig } from './provider-config.js'
import { createProviderGatewayLlmProvider } from './provider-gateway-llm-provider.js'
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

describe('createProviderGatewayLlmProvider', () => {
  it('adapts provider gateway responses to LLMProvider stream events', async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: {
        choices: [{ message: { content: 'gateway response' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      },
    })
    const provider = createProviderGatewayLlmProvider({
      config: loadProviderGatewayConfig({
        CODEMIND_PROVIDER: 'openai',
        CODEMIND_MODEL: 'gpt-test',
        OPENAI_API_KEY: 'openai-secret',
      }),
      transport,
    })

    const events: ProviderStreamEvent[] = []
    for await (const event of provider.complete(
      [{ role: 'user', content: 'hello' }],
      [],
      { systemPrompt: 'system prompt' },
    )) {
      events.push(event)
    }

    expect(provider.providerId).toBe('openai')
    expect(events).toEqual([
      { type: 'text_delta', text: 'gateway response' },
      {
        type: 'message_stop',
        stopReason: 'end_turn',
        usage: { inputTokens: 3, outputTokens: 4 },
      },
    ])
    expect(JSON.parse(transport.requests[0]?.body ?? '{}')).toMatchObject({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hello' }],
    })
  })

  it('flattens tool result messages into provider gateway text messages', async () => {
    const transport = new RecordingTransport({
      status: 200,
      headers: {},
      body: { choices: [{ message: { content: 'ok' } }] },
    })
    const provider = createProviderGatewayLlmProvider({
      config: loadProviderGatewayConfig({
        CODEMIND_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-secret',
      }),
      transport,
    })

    for await (const _event of provider.complete([
      {
        role: 'tool_result',
        content: [
          {
            type: 'tool_result',
            toolUseId: 'tool-1',
            content: 'tool output',
          },
        ],
      },
    ])) {
      // consume stream
    }

    expect(JSON.parse(transport.requests[0]?.body ?? '{}').messages[0]).toEqual({
      role: 'user',
      content: '[tool_result:tool-1] tool output',
    })
  })
})
