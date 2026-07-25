import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { SessionPersistence } from '../storage/session-persistence.js'
import { ConversationStore } from '../conversation/conversation-store.js'
import type { ConversationMessage } from '../conversation/conversation.types.js'
import { WorkspaceManager } from '../workspace/workspace-manager.js'

function createMessage(role: ConversationMessage['role'], content: string): ConversationMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

describe('session-e2e', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `symbolwright-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('session persistence round-trip', () => {
    it('saves and loads messages', () => {
      const persistence = new SessionPersistence(tempDir)
      const sessionId = 'test-session-1'

      const msg1 = createMessage('user', 'Hello SymbolWright')
      const msg2 = createMessage('assistant', 'Hello! How can I help?')

      persistence.appendMessage(sessionId, msg1)
      persistence.appendMessage(sessionId, msg2)

      const loaded = persistence.load(sessionId)
      expect(loaded).toHaveLength(2)
      expect(loaded[0]?.content).toBe('Hello SymbolWright')
      expect(loaded[1]?.content).toBe('Hello! How can I help?')
    })

    it('lists sessions with metadata', () => {
      const persistence = new SessionPersistence(tempDir)

      persistence.appendMessage('s1', createMessage('user', 'First session goal'))
      persistence.appendMessage('s2', createMessage('user', 'Second session goal'))
      persistence.appendMessage('s2', createMessage('assistant', 'Working on it...'))

      const sessions = persistence.listSessions()
      expect(sessions).toHaveLength(2)

      const s2 = sessions.find((s) => s.sessionId === 's2')
      expect(s2?.messageCount).toBe(2)
      expect(s2?.goal).toContain('Second session')
    })

    it('sessionExists returns correct value', () => {
      const persistence = new SessionPersistence(tempDir)

      expect(persistence.sessionExists('nonexistent')).toBe(false)

      persistence.appendMessage('exists', createMessage('user', 'test'))
      expect(persistence.sessionExists('exists')).toBe(true)
    })
  })

  describe('conversation store integration', () => {
    it('maintains conversation history', () => {
      const store = new ConversationStore()

      store.append('s1', createMessage('user', 'First message'))
      store.append('s1', createMessage('assistant', 'Response'))
      store.append('s1', createMessage('user', 'Second message'))

      const history = store.getHistory('s1')
      expect(history).toHaveLength(3)
      expect(history[0]?.role).toBe('user')
      expect(history[1]?.role).toBe('assistant')
    })

    it('lists all conversations', () => {
      const store = new ConversationStore()

      store.create('s1')
      store.create('s2')

      expect(store.list()).toHaveLength(2)
    })

    it('truncates conversation', () => {
      const store = new ConversationStore()
      store.append('s1', createMessage('user', 'msg1'))
      store.append('s1', createMessage('assistant', 'msg2'))
      store.append('s1', createMessage('user', 'msg3'))

      store.truncate('s1', 2)
      const history = store.getHistory('s1')
      expect(history).toHaveLength(2)
    })
  })

  describe('workspace manager integration', () => {
    it('adds and queries workspace repos', () => {
      const manager = new WorkspaceManager()
      manager.add(tempDir)

      expect(manager.size()).toBe(1)
      expect(manager.isFileInWorkspace(join(tempDir, 'some-file.ts'))).toBe(true)
      expect(manager.isFileInWorkspace('/outside/path')).toBe(false)
    })

    it('sets primary repo', () => {
      const manager = new WorkspaceManager()
      const repo = manager.add(tempDir)

      expect(manager.getPrimary()?.id).toBe(repo.id)
    })

    it('serializes and deserializes config', () => {
      const manager = new WorkspaceManager()
      manager.add(tempDir, 'TestRepo')

      const config = manager.toConfig()
      const restored = WorkspaceManager.fromConfig(config)

      expect(restored.size()).toBe(1)
      expect(restored.list()[0]?.displayName).toBe('TestRepo')
    })
  })
})
