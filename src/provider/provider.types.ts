export const PROVIDER_MESSAGE_ROLES = ['user', 'assistant', 'tool_use', 'tool_result'] as const
export type ProviderMessageRole = (typeof PROVIDER_MESSAGE_ROLES)[number]

export const PROVIDER_STOP_REASONS = ['end_turn', 'tool_use', 'max_tokens', 'error'] as const
export type ProviderStopReason = (typeof PROVIDER_STOP_REASONS)[number]

export const PROVIDER_STREAM_EVENT_TYPES = [
  'text_delta',
  'tool_use_start',
  'tool_use_delta',
  'tool_use_end',
  'message_stop',
  'error',
] as const
export type ProviderStreamEventType = (typeof PROVIDER_STREAM_EVENT_TYPES)[number]

export interface ProviderTextContent {
  readonly type: 'text'
  readonly text: string
}

export interface ProviderToolUseContent {
  readonly type: 'tool_use'
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}

export interface ProviderToolResultContent {
  readonly type: 'tool_result'
  readonly toolUseId: string
  readonly content: string
  readonly isError?: boolean
}

export type ProviderContentBlock =
  ProviderTextContent | ProviderToolUseContent | ProviderToolResultContent

export interface ProviderMessage {
  readonly role: ProviderMessageRole
  readonly content: readonly ProviderContentBlock[] | string
}

export interface ProviderToolInputSchema {
  readonly type: 'object'
  readonly properties: Record<string, unknown>
  readonly required?: readonly string[]
}

export interface ProviderToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: ProviderToolInputSchema
}

export interface ProviderTokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadInputTokens?: number
  readonly cacheCreationInputTokens?: number
}

export interface ProviderStreamTextDelta {
  readonly type: 'text_delta'
  readonly text: string
}

export interface ProviderStreamToolUseStart {
  readonly type: 'tool_use_start'
  readonly id: string
  readonly name: string
}

export interface ProviderStreamToolUseDelta {
  readonly type: 'tool_use_delta'
  readonly partialJson: string
}

export interface ProviderStreamToolUseEnd {
  readonly type: 'tool_use_end'
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}

export interface ProviderStreamMessageStop {
  readonly type: 'message_stop'
  readonly stopReason: ProviderStopReason
  readonly usage: ProviderTokenUsage
}

export interface ProviderStreamError {
  readonly type: 'error'
  readonly error: string
}

export type ProviderStreamEvent =
  | ProviderStreamTextDelta
  | ProviderStreamToolUseStart
  | ProviderStreamToolUseDelta
  | ProviderStreamToolUseEnd
  | ProviderStreamMessageStop
  | ProviderStreamError

export interface ProviderCompletionOptions {
  readonly model?: string
  readonly maxTokens?: number
  readonly systemPrompt?: string
  readonly temperature?: number
  readonly stopSequences?: readonly string[]
}

export interface LLMProvider {
  readonly providerId: string
  readonly displayName: string
  complete(
    messages: readonly ProviderMessage[],
    tools?: readonly ProviderToolDefinition[],
    options?: ProviderCompletionOptions,
  ): AsyncIterable<ProviderStreamEvent>
}
