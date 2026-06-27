import type { ProviderMessage, ProviderMessageRole } from '../provider/provider.types.js'
import type {
  RuntimeTranscript,
  RuntimeTranscriptEntry,
} from '../runtime/transcript/runtime-transcript.js'
import type { ConversationMessage, ConversationMessageRole } from './conversation.types.js'

function transcriptRoleToConversationRole(role: string): ConversationMessageRole {
  switch (role) {
    case 'system':
      return 'system'
    case 'tool':
      return 'tool_use'
    case 'result':
      return 'tool_result'
    case 'user':
      return 'user'
    case 'assistant':
      return 'assistant'
    default:
      return 'system'
  }
}

export function transcriptEntryToConversationMessage(
  entry: RuntimeTranscriptEntry,
  sessionId: string,
): ConversationMessage {
  return {
    id: `${sessionId}-transcript-${entry.iteration}-${entry.role}`,
    role: transcriptRoleToConversationRole(entry.role),
    content: entry.message,
    timestamp: new Date().toISOString(),
  }
}

export function transcriptToConversationMessages(
  transcript: RuntimeTranscript,
  sessionId: string,
): readonly ConversationMessage[] {
  return transcript.entries.map((entry) =>
    transcriptEntryToConversationMessage(entry, sessionId),
  )
}

function conversationRoleToProviderRole(role: ConversationMessageRole): ProviderMessageRole {
  switch (role) {
    case 'user':
      return 'user'
    case 'assistant':
      return 'assistant'
    case 'tool_use':
      return 'tool_use'
    case 'tool_result':
      return 'tool_result'
    case 'system':
      return 'user'
  }
}

export function conversationMessagesToProviderMessages(
  messages: readonly ConversationMessage[],
): ProviderMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: conversationRoleToProviderRole(m.role),
      content: m.content,
    }))
}

export function renderConversation(messages: readonly ConversationMessage[]): string {
  if (messages.length === 0) {
    return 'No conversation messages.'
  }

  return messages
    .map((m) => {
      const role = m.role.toUpperCase()
      const prefix = m.toolName !== undefined ? `[${role}:${m.toolName}]` : `[${role}]`
      return `${prefix} ${m.content}`
    })
    .join('\n\n')
}
