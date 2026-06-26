import { describe, expect, it } from 'vitest'

import {
  transcriptEntryToConversationMessage,
  transcriptToConversationMessages,
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
