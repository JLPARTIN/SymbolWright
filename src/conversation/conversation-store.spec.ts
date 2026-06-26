import { describe, expect, it } from 'vitest'

import { ConversationStore } from './conversation-store.js'
import type { ConversationMessage } from './conversation.types.js'

function makeMessage(
  id: string,
  role: ConversationMessage['role'] = 'user',
  content = 'test message',
): ConversationMessage {
  return {
    id,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

describe('ConversationStore', () => {
  describe('create', () => {
    it('creates a new empty history', () => {
      const store = new ConversationStore()
      const history = store.create('session-1')

      expect(history.sessionId).toBe('session-1')
      expect(history.messages).toHaveLength(0)
      expect(history.createdAt).toBeTruthy()
      expect(history.updatedAt).toBeTruthy()
    })
  })

  describe('get', () => {
    it('returns undefined for non-existent session', () => {
      const store = new ConversationStore()
      expect(store.get('nonexistent')).toBeUndefined()
    })

    it('returns existing history', () => {
      const store = new ConversationStore()
      store.create('session-1')
      const history = store.get('session-1')
      expect(history?.sessionId).toBe('session-1')
    })
  })

  describe('getOrCreate', () => {
    it('creates if not exists', () => {
      const store = new ConversationStore()
      const history = store.getOrCreate('session-1')
      expect(history.sessionId).toBe('session-1')
    })

    it('returns existing if present', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1'))
      const history = store.getOrCreate('session-1')
      expect(history.messages).toHaveLength(1)
    })
  })

  describe('append', () => {
    it('appends message to history', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1', 'user', 'Hello'))
      store.append('session-1', makeMessage('msg-2', 'assistant', 'Hi there'))

      const messages = store.getHistory('session-1')
      expect(messages).toHaveLength(2)
      expect(messages[0]?.content).toBe('Hello')
      expect(messages[1]?.content).toBe('Hi there')
    })

    it('creates history if not exists', () => {
      const store = new ConversationStore()
      store.append('session-1', makeMessage('msg-1'))

      const history = store.get('session-1')
      expect(history).toBeDefined()
      expect(history?.messages).toHaveLength(1)
    })

    it('updates updatedAt timestamp', () => {
      const store = new ConversationStore()
      const h1 = store.create('session-1')
      const h2 = store.append('session-1', makeMessage('msg-1'))

      expect(h2.updatedAt).toBeTruthy()
      expect(h2.createdAt).toBe(h1.createdAt)
    })
  })

  describe('getHistory', () => {
    it('returns empty array for non-existent session', () => {
      const store = new ConversationStore()
      expect(store.getHistory('nonexistent')).toEqual([])
    })
  })

  describe('fork', () => {
    it('forks from a specific message', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1', 'user', 'First'))
      store.append('session-1', makeMessage('msg-2', 'assistant', 'Second'))
      store.append('session-1', makeMessage('msg-3', 'user', 'Third'))

      const forked = store.fork('session-1', 'fork-1', 'msg-2')

      expect(forked.sessionId).toBe('fork-1')
      expect(forked.messages).toHaveLength(2)
      expect(forked.messages[0]?.content).toBe('First')
      expect(forked.messages[1]?.content).toBe('Second')
      expect(forked.fork?.parentSessionId).toBe('session-1')
      expect(forked.fork?.forkPointMessageId).toBe('msg-2')
    })

    it('copies all messages if fork point not found', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1'))
      store.append('session-1', makeMessage('msg-2'))

      const forked = store.fork('session-1', 'fork-1', 'nonexistent')
      expect(forked.messages).toHaveLength(2)
    })

    it('creates empty fork for non-existent source', () => {
      const store = new ConversationStore()
      const forked = store.fork('nonexistent', 'fork-1', 'msg-1')
      expect(forked.sessionId).toBe('fork-1')
      expect(forked.messages).toHaveLength(0)
      expect(forked.fork).toBeUndefined()
    })
  })

  describe('truncate', () => {
    it('keeps last N messages', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1', 'user', 'First'))
      store.append('session-1', makeMessage('msg-2', 'assistant', 'Second'))
      store.append('session-1', makeMessage('msg-3', 'user', 'Third'))

      const truncated = store.truncate('session-1', 2)
      expect(truncated?.messages).toHaveLength(2)
      expect(truncated?.messages[0]?.content).toBe('Second')
      expect(truncated?.messages[1]?.content).toBe('Third')
    })

    it('returns undefined for non-existent session', () => {
      const store = new ConversationStore()
      expect(store.truncate('nonexistent', 5)).toBeUndefined()
    })

    it('keeps all messages when count exceeds length', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1'))

      const truncated = store.truncate('session-1', 100)
      expect(truncated?.messages).toHaveLength(1)
    })

    it('handles zero keepCount', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.append('session-1', makeMessage('msg-1'))

      const truncated = store.truncate('session-1', 0)
      expect(truncated?.messages).toHaveLength(0)
    })
  })

  describe('list', () => {
    it('returns all histories', () => {
      const store = new ConversationStore()
      store.create('session-1')
      store.create('session-2')

      const histories = store.list()
      expect(histories).toHaveLength(2)
    })

    it('returns empty array when no histories', () => {
      const store = new ConversationStore()
      expect(store.list()).toHaveLength(0)
    })
  })

  describe('delete', () => {
    it('removes a history', () => {
      const store = new ConversationStore()
      store.create('session-1')
      expect(store.delete('session-1')).toBe(true)
      expect(store.get('session-1')).toBeUndefined()
    })

    it('returns false for non-existent session', () => {
      const store = new ConversationStore()
      expect(store.delete('nonexistent')).toBe(false)
    })
  })
})
