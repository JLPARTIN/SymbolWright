import type { ConversationMessage } from './conversation.types.js'

const DEFAULT_CHARS_PER_TOKEN = 4
const DEFAULT_MODEL_CONTEXT_LIMIT = 200000
const DEFAULT_SYSTEM_PROMPT_RESERVE = 8000
const DEFAULT_TOOL_SCHEMA_RESERVE = 4000
const DEFAULT_RESPONSE_RESERVE = 8192

export interface ContextWindowConfig {
  readonly modelContextLimit?: number
  readonly systemPromptReserve?: number
  readonly toolSchemaReserve?: number
  readonly responseReserve?: number
  readonly charsPerToken?: number
}

export interface ContextWindowBudget {
  readonly modelContextLimit: number
  readonly systemPromptReserve: number
  readonly toolSchemaReserve: number
  readonly responseReserve: number
  readonly availableForMessages: number
}

export interface ContextWindowFitResult {
  readonly fits: boolean
  readonly totalTokenEstimate: number
  readonly availableTokens: number
  readonly messagesIncluded: number
  readonly messagesDropped: number
}

export function estimateTokens(
  text: string,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): number {
  return Math.ceil(text.length / charsPerToken)
}

export function estimateMessageTokens(
  message: ConversationMessage,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): number {
  if (message.tokenEstimate !== undefined) {
    return message.tokenEstimate
  }
  const roleOverhead = 4
  return estimateTokens(message.content, charsPerToken) + roleOverhead
}

export function computeContextBudget(config: ContextWindowConfig = {}): ContextWindowBudget {
  const modelContextLimit = config.modelContextLimit ?? DEFAULT_MODEL_CONTEXT_LIMIT
  const systemPromptReserve = config.systemPromptReserve ?? DEFAULT_SYSTEM_PROMPT_RESERVE
  const toolSchemaReserve = config.toolSchemaReserve ?? DEFAULT_TOOL_SCHEMA_RESERVE
  const responseReserve = config.responseReserve ?? DEFAULT_RESPONSE_RESERVE

  const availableForMessages = Math.max(
    0,
    modelContextLimit - systemPromptReserve - toolSchemaReserve - responseReserve,
  )

  return {
    modelContextLimit,
    systemPromptReserve,
    toolSchemaReserve,
    responseReserve,
    availableForMessages,
  }
}

export function fitMessagesToWindow(
  messages: readonly ConversationMessage[],
  budget: ContextWindowBudget,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): ContextWindowFitResult {
  const available = budget.availableForMessages
  let totalTokens = 0

  const messageTokens = messages.map((m) => estimateMessageTokens(m, charsPerToken))
  const totalAll = messageTokens.reduce((sum, t) => sum + t, 0)

  if (totalAll <= available) {
    return {
      fits: true,
      totalTokenEstimate: totalAll,
      availableTokens: available,
      messagesIncluded: messages.length,
      messagesDropped: 0,
    }
  }

  let startIndex = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    totalTokens += messageTokens[i]!
    if (totalTokens > available) {
      startIndex = i + 1
      break
    }
  }

  const included = messages.length - startIndex
  const includedTokens = messageTokens.slice(startIndex).reduce((sum, t) => sum + t, 0)

  return {
    fits: false,
    totalTokenEstimate: includedTokens,
    availableTokens: available,
    messagesIncluded: included,
    messagesDropped: startIndex,
  }
}

export function compactMessages(
  messages: readonly ConversationMessage[],
  budget: ContextWindowBudget,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): readonly ConversationMessage[] {
  const fit = fitMessagesToWindow(messages, budget, charsPerToken)

  if (fit.fits) {
    return messages
  }

  return messages.slice(fit.messagesDropped)
}

export function trimConversationToFit(
  messages: readonly ConversationMessage[],
  config: ContextWindowConfig = {},
): readonly ConversationMessage[] {
  const budget = computeContextBudget(config)
  return compactMessages(messages, budget, config.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN)
}
