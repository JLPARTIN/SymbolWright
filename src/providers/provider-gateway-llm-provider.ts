import type {
  LLMProvider,
  ProviderCompletionOptions,
  ProviderContentBlock,
  ProviderMessage,
  ProviderStreamEvent,
} from '../provider/provider.types.js'
import { ProviderGateway } from './provider-gateway.js'
import type {
  ProviderGatewayConfig,
  ProviderGatewayMessage,
  ProviderHttpTransport,
} from './provider-gateway.types.js'

export interface ProviderGatewayLlmProviderOptions {
  readonly config: ProviderGatewayConfig
  readonly transport?: ProviderHttpTransport
}

function contentBlockToText(block: ProviderContentBlock): string {
  if (block.type === 'text') {
    return block.text
  }
  if (block.type === 'tool_use') {
    return `[tool_use:${block.name}] ${JSON.stringify(block.input)}`
  }
  return `[tool_result:${block.toolUseId}] ${block.content}`
}

function providerMessageToGatewayMessage(message: ProviderMessage): ProviderGatewayMessage {
  const role = message.role === 'assistant' ? 'assistant' : 'user'
  const content =
    typeof message.content === 'string'
      ? message.content
      : message.content.map(contentBlockToText).join('\n')

  return { role, content }
}

export function createProviderGatewayLlmProvider(
  options: ProviderGatewayLlmProviderOptions,
): LLMProvider {
  const gateway = new ProviderGateway({
    config: options.config,
    ...(options.transport === undefined ? {} : { transport: options.transport }),
  })

  return {
    providerId: options.config.activeProvider ?? 'provider-gateway',
    displayName: 'CodeMind Provider Gateway',

    async *complete(
      messages: readonly ProviderMessage[],
      _tools?: readonly unknown[],
      completionOptions?: ProviderCompletionOptions,
    ): AsyncIterable<ProviderStreamEvent> {
      const response = await gateway.run({
        ...(options.config.activeProvider === undefined
          ? {}
          : { providerId: options.config.activeProvider }),
        ...(completionOptions?.model === undefined ? {} : { model: completionOptions.model }),
        ...(completionOptions?.systemPrompt === undefined
          ? {}
          : { systemPrompt: completionOptions.systemPrompt }),
        ...(completionOptions?.temperature === undefined
          ? {}
          : { temperature: completionOptions.temperature }),
        ...(completionOptions?.maxTokens === undefined
          ? {}
          : { maxTokens: completionOptions.maxTokens }),
        messages: messages.map(providerMessageToGatewayMessage),
      })

      if (response.text.length > 0) {
        yield { type: 'text_delta', text: response.text }
      }

      yield {
        type: 'message_stop',
        stopReason: 'end_turn',
        usage: {
          inputTokens: response.usage?.inputTokens ?? 0,
          outputTokens: response.usage?.outputTokens ?? 0,
        },
      }
    },
  }
}
