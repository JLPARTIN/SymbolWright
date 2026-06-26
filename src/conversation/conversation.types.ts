export const CONVERSATION_MESSAGE_ROLES = [
  'user',
  'assistant',
  'tool_use',
  'tool_result',
  'system',
] as const
export type ConversationMessageRole = (typeof CONVERSATION_MESSAGE_ROLES)[number]

export interface ConversationMessage {
  readonly id: string
  readonly role: ConversationMessageRole
  readonly content: string
  readonly timestamp: string
  readonly tokenEstimate?: number
  readonly toolUseId?: string
  readonly toolName?: string
  readonly isError?: boolean
}

export interface ConversationFork {
  readonly forkId: string
  readonly parentSessionId: string
  readonly forkPointMessageId: string
  readonly forkedAt: string
}

export interface ConversationHistory {
  readonly sessionId: string
  readonly messages: readonly ConversationMessage[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly fork?: ConversationFork
}
