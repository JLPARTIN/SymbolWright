import { describe, expect, it } from 'vitest'

import {
  transcriptEntryToConversationMessage,
  transcriptToConversationMessages,
  conversationMessagesToProviderMessages,
  renderConversation,
} from './transcript-bridge.js'
import type { RuntimeTranscript, RuntimeTranscriptEntry } from '../runtime/transcript/runtime-transcript.js'
import type { ConversationMessage } from './conversation.types.js'

describe('transcript-bridge', () => {
  describe('transcriptEntryToConversationMessage', () => {
    it('maps system role', () => {
      const entry: RuntimeTranscriptEntry = { iteration: 0, role: 'system', message: 'System init' }
      const msg = transcriptEntryToConversationMessage(entry, 'session-1')

      expect(msg.role).toBe('system')
      expect(msg.content).toBe('System init')
      expect(msg.id).toContain('session-1')
    })

    it('maps tool role to tool_use', () => {
      const entry: RuntimeTranscriptEntry = { iteration: 1, role: 'tool', message: 'read_file executed' }
      const msg = transcriptEntryToConversationMessage(entry, 'session-1')

      expect(msg.role).toBe('tool_use')
    })

    it('maps result role to tool_result', () => {
      const entry: RuntimeTranscriptEntry = { iteration: 1, role: 'result', message: 'File contents' }
      const msg = transcriptEntryToConversationMessage(entry, 'session-1')

      expect(msg.role).toBe('tool_result')
    })

    it('generates unique ids', () => {
      const entry1: RuntimeTranscriptEntry = { iteration: 0, role: 'system', message: 'First' }
      const entry2: RuntimeTranscriptEntry = { iteration: 1, role: 'tool', message: 'Second' }

      const msg1 = transcriptEntryToConversationMessage(entry1, 'session-1')
      const msg2 = transcriptEntryToConversationMessage(entry2, 'session-1')

      expect(msg1.id).not.toBe(msg2.id)
    })
  })

  describe('transcriptToConversationMessages', () => {
    it('converts entire transcript', () => {
      const transcript: RuntimeTranscript = {
        goal: 'Test goal',
        entries: [
          { iteration: 0, role: 'system', message: 'Initialized' },
          { iteration: 1, role: 'tool', message: 'Executed plan_goal' },
          { iteration: 1, role: 'result', message: 'Plan created' },
        ],
      }

      const messages = transcriptToConversationMessages(transcript, 'session-1')

      expect(messages).toHaveLength(3)
      expect(messages[0]?.role).toBe('system')
      expect(messages[1]?.role).toBe('tool_use')
      expect(messages[2]?.role).toBe('tool_result')
    })

    it('handles empty transcript', () => {
      const transcript: RuntimeTranscript = { goal: 'Empty', entries: [] }
      const messages = transcriptToConversationMessages(transcript, 'session-1')
      expect(messages).toHaveLength(0)
    })
  })

  describe('conversationMessagesToProviderMessages', () => {
    it('converts user and assistant messages', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: '' },
        { id: '2', role: 'assistant', content: 'Hi there', timestamp: '' },
        { id: '3', role: 'user', content: 'What can you do?', timestamp: '' },
      ]

      const result = conversationMessagesToProviderMessages(messages)

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' })
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there' })
      expect(result[2]).toEqual({ role: 'user', content: 'What can you do?' })
    })

    it('filters out system messages', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'system', content: 'System init', timestamp: '' },
        { id: '2', role: 'user', content: 'Hello', timestamp: '' },
        { id: '3', role: 'assistant', content: 'Hi', timestamp: '' },
      ]

      const result = conversationMessagesToProviderMessages(messages)

      expect(result).toHaveLength(2)
      expect(result[0]?.role).toBe('user')
      expect(result[1]?.role).toBe('assistant')
    })

    it('filters out tool_use and tool_result messages', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Read file', timestamp: '' },
        { id: '2', role: 'tool_use', content: 'read_file', timestamp: '', toolName: 'read_file' },
        { id: '3', role: 'tool_result', content: 'file content', timestamp: '' },
        { id: '4', role: 'assistant', content: 'Here is the file.', timestamp: '' },
      ]

      const result = conversationMessagesToProviderMessages(messages)

      expect(result).toHaveLength(2)
      expect(result[0]?.content).toBe('Read file')
      expect(result[1]?.content).toBe('Here is the file.')
    })

    it('handles empty messages', () => {
      const result = conversationMessagesToProviderMessages([])
      expect(result).toHaveLength(0)
    })
  })

  describe('renderConversation', () => {
    it('renders messages with role labels', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: '' },
        { id: '2', role: 'assistant', content: 'Hi there', timestamp: '' },
      ]

      const rendered = renderConversation(messages)
      expect(rendered).toContain('[USER] Hello')
      expect(rendered).toContain('[ASSISTANT] Hi there')
    })

    it('includes tool name when present', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'tool_use', content: 'read_file executed', timestamp: '', toolName: 'read_file' },
      ]

      const rendered = renderConversation(messages)
      expect(rendered).toContain('[TOOL_USE:read_file]')
    })

    it('returns placeholder for empty messages', () => {
      const rendered = renderConversation([])
      expect(rendered).toContain('No conversation messages')
    })
  })
})
