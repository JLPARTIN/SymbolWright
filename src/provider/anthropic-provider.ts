import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  ProviderCompletionOptions,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolDefinition,
} from './provider.types.js'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 8192

export interface AnthropicProviderConfig {
  readonly apiKey: string
  readonly model?: string
  readonly maxTokens?: number
  readonly baseURL?: string
}

function toAnthropicMessages(
  messages: readonly ProviderMessage[],
): Anthropic.MessageCreateParams['messages'] {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return {
        role: message.role === 'user' || message.role === 'tool_result' ? 'user' : 'assistant',
        content: message.content,
      } as Anthropic.MessageParam
    }

    const blocks: Anthropic.ContentBlockParam[] = message.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text }
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input,
        }
      }
      return {
        type: 'tool_result' as const,
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError !== undefined ? { is_error: block.isError } : {}),
      }
    })

    const role = message.role === 'user' || message.role === 'tool_result' ? 'user' : 'assistant'
    return { role, content: blocks } as Anthropic.MessageParam
  })
}

function toAnthropicTools(
  tools: readonly ProviderToolDefinition[],
): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }))
}

export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
  })

  const defaultModel = config.model ?? DEFAULT_MODEL
  const defaultMaxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS

  return {
    providerId: 'anthropic',
    displayName: 'Anthropic Claude',

    async *complete(
      messages: readonly ProviderMessage[],
      tools?: readonly ProviderToolDefinition[],
      options?: ProviderCompletionOptions,
    ): AsyncIterable<ProviderStreamEvent> {
      const model = options?.model ?? defaultModel
      const maxTokens = options?.maxTokens ?? defaultMaxTokens
      const anthropicMessages = toAnthropicMessages(messages)

      const params: Anthropic.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        stream: true,
        ...(tools !== undefined && tools.length > 0
          ? { tools: toAnthropicTools(tools) }
          : {}),
        ...(options?.systemPrompt !== undefined ? { system: options.systemPrompt } : {}),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.stopSequences !== undefined
          ? { stop_sequences: [...options.stopSequences] }
          : {}),
      }

      const stream = client.messages.stream(params)
      let currentToolId: string | undefined
      let currentToolName: string | undefined

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block
          if (block.type === 'text') {
            // text block start, no delta yet
          } else if (block.type === 'tool_use') {
            currentToolId = block.id
            currentToolName = block.name
            yield {
              type: 'tool_use_start',
              id: block.id,
              name: block.name,
            }
          }
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', text: delta.text }
          } else if (delta.type === 'input_json_delta') {
            yield { type: 'tool_use_delta', partialJson: delta.partial_json }
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolId !== undefined && currentToolName !== undefined) {
            const finalMessage = await stream.finalMessage()
            const toolBlock = finalMessage.content.find(
              (b): b is Anthropic.ToolUseBlock =>
                b.type === 'tool_use' && b.id === currentToolId,
            )
            yield {
              type: 'tool_use_end',
              id: currentToolId,
              name: currentToolName,
              input: (toolBlock?.input as Record<string, unknown>) ?? {},
            }
            currentToolId = undefined
            currentToolName = undefined
          }
        } else if (event.type === 'message_stop') {
          const finalMessage = await stream.finalMessage()
          const usage = finalMessage.usage as unknown as Record<string, number | undefined>
          const cacheRead = usage['cache_read_input_tokens']
          const cacheCreation = usage['cache_creation_input_tokens']
          yield {
            type: 'message_stop',
            stopReason: finalMessage.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
            usage: {
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
              ...(cacheRead !== undefined ? { cacheReadInputTokens: cacheRead } : {}),
              ...(cacheCreation !== undefined ? { cacheCreationInputTokens: cacheCreation } : {}),
            },
          }
        }
      }
    },
  }
}
