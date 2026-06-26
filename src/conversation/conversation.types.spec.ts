import { describe, expect, it } from 'vitest'

import {
  CONVERSATION_MESSAGE_ROLES,
  type ConversationMessage,
  type ConversationHistory,
  type ConversationFork,
} from './conversation.types.js'

describe('conversation.types', () => {
  describe('CONVERSATION_MESSAGE_ROLES', () => {
    it('includes all expected roles', () => {
      expect(CONVERSATION_MESSAGE_ROLES).toEqual([
        'user',
        'assistant',
        'tool_use',
        'tool_result',
        'system',
      ])
    })

    it('has 5 roles', () => {
      expect(CONVERSATION_MESSAGE_ROLES.length).toBe(5)
    })
  })

  describe('ConversationMessage', () => {
    it('can create a user message', () => {
      const message: ConversationMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Fix the auth bug',
        timestamp: '2025-01-01T00:00:00.000Z',
      }
      expect(message.id).toBe('msg-1')
      expect(message.role).toBe('user')
    })

    it('supports optional fields', () => {
      const message: ConversationMessage = {
        id: 'msg-2',
        role: 'tool_result',
        content: 'File contents here',
        timestamp: '2025-01-01T00:00:00.000Z',
        tokenEstimate: 150,
        toolUseId: 'tool-1',
        toolName: 'read_file',
        isError: false,
      }
      expect(message.tokenEstimate).toBe(150)
      expect(message.toolUseId).toBe('tool-1')
      expect(message.toolName).toBe('read_file')
      expect(message.isError).toBe(false)
    })
  })

  describe('ConversationHistory', () => {
    it('has required fields', () => {
      const history: ConversationHistory = {
        sessionId: 'session-1',
        messages: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      }
      expect(history.sessionId).toBe('session-1')
      expect(history.messages).toHaveLength(0)
    })

    it('supports fork info', () => {
      const fork: ConversationFork = {
        forkId: 'fork-1',
        parentSessionId: 'session-1',
        forkPointMessageId: 'msg-5',
        forkedAt: '2025-01-01T00:00:00.000Z',
      }
      const history: ConversationHistory = {
        sessionId: 'fork-1',
        messages: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        fork,
      }
      expect(history.fork?.forkId).toBe('fork-1')
      expect(history.fork?.parentSessionId).toBe('session-1')
    })
  })
})
