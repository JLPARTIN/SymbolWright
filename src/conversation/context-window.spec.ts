import { describe, expect, it } from 'vitest'

import {
  estimateTokens,
  estimateMessageTokens,
  computeContextBudget,
  fitMessagesToWindow,
  compactMessages,
} from './context-window.js'
import type { ConversationMessage } from './conversation.types.js'

function makeMessage(
  content: string,
  tokenEstimate?: number,
): ConversationMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
    ...(tokenEstimate !== undefined ? { tokenEstimate } : {}),
  }
}

describe('context-window', () => {
  describe('estimateTokens', () => {
    it('estimates tokens at 4 chars per token', () => {
      expect(estimateTokens('Hello world!')).toBe(3)
    })

    it('rounds up', () => {
      expect(estimateTokens('Hi')).toBe(1)
    })

    it('handles empty string', () => {
      expect(estimateTokens('')).toBe(0)
    })

    it('accepts custom chars per token', () => {
      expect(estimateTokens('Hello world!', 3)).toBe(4)
    })
  })

  describe('estimateMessageTokens', () => {
    it('uses tokenEstimate when provided', () => {
      const message = makeMessage('Hello', 42)
      expect(estimateMessageTokens(message)).toBe(42)
    })

    it('estimates from content when no tokenEstimate', () => {
      const message = makeMessage('Hello world, this is a test message')
      const estimate = estimateMessageTokens(message)
      expect(estimate).toBeGreaterThan(0)
      expect(estimate).toBe(Math.ceil(35 / 4) + 4)
    })

    it('includes role overhead', () => {
      const message = makeMessage('')
      const estimate = estimateMessageTokens(message)
      expect(estimate).toBe(4)
    })
  })

  describe('computeContextBudget', () => {
    it('uses defaults', () => {
      const budget = computeContextBudget()
      expect(budget.modelContextLimit).toBe(200000)
      expect(budget.systemPromptReserve).toBe(8000)
      expect(budget.toolSchemaReserve).toBe(4000)
      expect(budget.responseReserve).toBe(8192)
      expect(budget.availableForMessages).toBe(200000 - 8000 - 4000 - 8192)
    })

    it('accepts custom limits', () => {
      const budget = computeContextBudget({
        modelContextLimit: 100000,
        systemPromptReserve: 5000,
        toolSchemaReserve: 2000,
        responseReserve: 4096,
      })
      expect(budget.availableForMessages).toBe(100000 - 5000 - 2000 - 4096)
    })

    it('clamps to zero when reserves exceed limit', () => {
      const budget = computeContextBudget({
        modelContextLimit: 1000,
        systemPromptReserve: 500,
        toolSchemaReserve: 400,
        responseReserve: 200,
      })
      expect(budget.availableForMessages).toBe(0)
    })
  })

  describe('fitMessagesToWindow', () => {
    const budget = computeContextBudget({ modelContextLimit: 1000, responseReserve: 0, systemPromptReserve: 0, toolSchemaReserve: 0 })

    it('all messages fit', () => {
      const messages = [makeMessage('Hello', 100), makeMessage('World', 100)]
      const result = fitMessagesToWindow(messages, budget)

      expect(result.fits).toBe(true)
      expect(result.messagesIncluded).toBe(2)
      expect(result.messagesDropped).toBe(0)
    })

    it('drops oldest messages when they do not fit', () => {
      const messages = [
        makeMessage('First', 400),
        makeMessage('Second', 400),
        makeMessage('Third', 400),
      ]
      const result = fitMessagesToWindow(messages, budget)

      expect(result.fits).toBe(false)
      expect(result.messagesIncluded).toBe(2)
      expect(result.messagesDropped).toBe(1)
    })

    it('handles empty messages', () => {
      const result = fitMessagesToWindow([], budget)
      expect(result.fits).toBe(true)
      expect(result.messagesIncluded).toBe(0)
    })

    it('single message exceeds budget', () => {
      const messages = [makeMessage('Huge', 2000)]
      const result = fitMessagesToWindow(messages, budget)

      expect(result.fits).toBe(false)
      expect(result.messagesDropped).toBe(1)
    })
  })

  describe('compactMessages', () => {
    const budget = computeContextBudget({ modelContextLimit: 500, responseReserve: 0, systemPromptReserve: 0, toolSchemaReserve: 0 })

    it('returns all messages when they fit', () => {
      const messages = [makeMessage('Hello', 100)]
      const result = compactMessages(messages, budget)
      expect(result).toHaveLength(1)
    })

    it('drops old messages when they do not fit', () => {
      const messages = [
        makeMessage('Old', 300),
        makeMessage('Recent', 300),
      ]
      const result = compactMessages(messages, budget)
      expect(result).toHaveLength(1)
      expect(result[0]?.content).toBe('Recent')
    })

    it('handles empty messages', () => {
      const result = compactMessages([], budget)
      expect(result).toHaveLength(0)
    })
  })
})
