import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { SessionPersistence } from './session-persistence.js'
import type { ConversationMessage } from '../conversation/conversation.types.js'

const TEST_DIR = join(process.cwd(), '.test-session-persistence')

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: 'Hello, world!',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('SessionPersistence', () => {
  let persistence: SessionPersistence

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    persistence = new SessionPersistence(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('save and load round-trips messages', () => {
    const messages = [
      makeMessage({ id: 'msg-1', content: 'First' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Response' }),
    ]

    persistence.save('session-1', messages)
    const loaded = persistence.load('session-1')

    expect(loaded).toHaveLength(2)
    expect(loaded[0]!.content).toBe('First')
    expect(loaded[1]!.role).toBe('assistant')
  })

  it('load returns empty for non-existent session', () => {
    const loaded = persistence.load('non-existent')
    expect(loaded).toHaveLength(0)
  })

  it('appendMessage adds to existing session', () => {
    persistence.save('session-2', [makeMessage({ id: 'msg-1' })])
    persistence.appendMessage('session-2', makeMessage({ id: 'msg-2', content: 'Appended' }))

    const loaded = persistence.load('session-2')
    expect(loaded).toHaveLength(2)
  })

  it('listSessions returns sessions sorted by update time', () => {
    persistence.save('session-a', [makeMessage({ content: 'Goal A' })])
    persistence.save('session-b', [makeMessage({ content: 'Goal B' })])

    const sessions = persistence.listSessions()
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    expect(sessions[0]!.sessionId).toBeDefined()
  })

  it('listSessions returns empty for non-existent directory', () => {
    const freshPersistence = new SessionPersistence('/nonexistent/path/sessions')
    expect(freshPersistence.listSessions()).toHaveLength(0)
  })

  it('sessionExists returns correct state', () => {
    expect(persistence.sessionExists('missing')).toBe(false)

    persistence.save('existing', [makeMessage()])
    expect(persistence.sessionExists('existing')).toBe(true)
  })

  it('session includes goal from first user message', () => {
    persistence.save('session-goal', [
      makeMessage({ role: 'user', content: 'Fix the authentication bug in login.ts' }),
      makeMessage({ role: 'assistant', content: 'I will fix it.' }),
    ])

    const sessions = persistence.listSessions()
    const session = sessions.find((s) => s.sessionId === 'session-goal')
    expect(session).toBeDefined()
    expect(session!.goal).toContain('Fix the authentication')
  })

  it('save overwrites existing session', () => {
    persistence.save('session-overwrite', [
      makeMessage({ id: '1', content: 'Original' }),
    ])
    persistence.save('session-overwrite', [
      makeMessage({ id: '2', content: 'Replacement' }),
    ])

    const loaded = persistence.load('session-overwrite')
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.content).toBe('Replacement')
  })
})
