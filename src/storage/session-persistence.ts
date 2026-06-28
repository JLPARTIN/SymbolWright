import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { JsonlStore } from './jsonl-store.js'
import { sessionFilePath } from './storage-paths.js'
import type { ConversationMessage } from '../conversation/conversation.types.js'

export interface PersistedSession {
  readonly sessionId: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly messageCount: number
  readonly goal?: string
}

export interface SessionPersistenceEntry {
  readonly type: 'message'
  readonly sessionId: string
  readonly timestamp: string
  readonly message: ConversationMessage
}

export class SessionPersistence {
  constructor(private readonly sessionsDir: string) {}

  save(sessionId: string, messages: readonly ConversationMessage[]): void {
    const filePath = sessionFilePath(this.sessionsDir, sessionId)
    const store = new JsonlStore<SessionPersistenceEntry>({ filePath })

    store.clear()
    const entries: SessionPersistenceEntry[] = messages.map((message) => ({
      type: 'message',
      sessionId,
      timestamp: message.timestamp,
      message,
    }))
    store.appendAll(entries)
  }

  appendMessage(sessionId: string, message: ConversationMessage): void {
    const filePath = sessionFilePath(this.sessionsDir, sessionId)
    const store = new JsonlStore<SessionPersistenceEntry>({ filePath })

    store.append({
      type: 'message',
      sessionId,
      timestamp: message.timestamp,
      message,
    })
  }

  load(sessionId: string): readonly ConversationMessage[] {
    const filePath = sessionFilePath(this.sessionsDir, sessionId)
    const store = new JsonlStore<SessionPersistenceEntry>({ filePath, createIfMissing: false })

    if (!store.exists()) return []

    return store.readAll().map((entry) => entry.message)
  }

  listSessions(): readonly PersistedSession[] {
    if (!existsSync(this.sessionsDir)) return []

    const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith('.jsonl'))

    const sessions: PersistedSession[] = []

    for (const file of files) {
      const filePath = join(this.sessionsDir, file)
      const sessionId = basename(file, '.jsonl')

      try {
        const stat = statSync(filePath)
        const store = new JsonlStore<SessionPersistenceEntry>({ filePath, createIfMissing: false })
        const entries = store.readAll()
        const firstMessage = entries.find((e) => e.message.role === 'user')

        sessions.push({
          sessionId,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
          messageCount: entries.length,
          ...(firstMessage !== undefined
            ? { goal: firstMessage.message.content.substring(0, 100) }
            : {}),
        })
      } catch {
        // skip unreadable files
      }
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  sessionExists(sessionId: string): boolean {
    const filePath = sessionFilePath(this.sessionsDir, sessionId)
    return existsSync(filePath)
  }
}
