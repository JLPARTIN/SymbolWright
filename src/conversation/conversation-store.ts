import type {
  ConversationMessage,
  ConversationHistory,
  ConversationFork,
} from './conversation.types.js'

export class ConversationStore {
  private readonly histories = new Map<string, ConversationHistory>()

  create(sessionId: string): ConversationHistory {
    const now = new Date().toISOString()
    const history: ConversationHistory = {
      sessionId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    this.histories.set(sessionId, history)
    return history
  }

  get(sessionId: string): ConversationHistory | undefined {
    return this.histories.get(sessionId)
  }

  getOrCreate(sessionId: string): ConversationHistory {
    return this.histories.get(sessionId) ?? this.create(sessionId)
  }

  append(sessionId: string, message: ConversationMessage): ConversationHistory {
    const history = this.getOrCreate(sessionId)
    const updated: ConversationHistory = {
      ...history,
      messages: [...history.messages, message],
      updatedAt: new Date().toISOString(),
    }
    this.histories.set(sessionId, updated)
    return updated
  }

  getHistory(sessionId: string): readonly ConversationMessage[] {
    return this.histories.get(sessionId)?.messages ?? []
  }

  fork(sessionId: string, forkId: string, forkPointMessageId: string): ConversationHistory {
    const source = this.histories.get(sessionId)
    if (source === undefined) {
      return this.create(forkId)
    }

    const forkPointIndex = source.messages.findIndex((m) => m.id === forkPointMessageId)
    const messagesToKeep =
      forkPointIndex >= 0 ? source.messages.slice(0, forkPointIndex + 1) : [...source.messages]

    const forkInfo: ConversationFork = {
      forkId,
      parentSessionId: sessionId,
      forkPointMessageId,
      forkedAt: new Date().toISOString(),
    }

    const forked: ConversationHistory = {
      sessionId: forkId,
      messages: messagesToKeep,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fork: forkInfo,
    }
    this.histories.set(forkId, forked)
    return forked
  }

  truncate(sessionId: string, keepCount: number): ConversationHistory | undefined {
    const history = this.histories.get(sessionId)
    if (history === undefined) {
      return undefined
    }

    const safeCount = Math.max(0, keepCount)
    const truncated: ConversationHistory = {
      ...history,
      messages: safeCount === 0 ? [] : history.messages.slice(-safeCount),
      updatedAt: new Date().toISOString(),
    }
    this.histories.set(sessionId, truncated)
    return truncated
  }

  list(): readonly ConversationHistory[] {
    return [...this.histories.values()]
  }

  delete(sessionId: string): boolean {
    return this.histories.delete(sessionId)
  }
}
