import { describe, expect, it } from 'vitest'

import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopConfig } from '../agent/agent-loop.types.js'
import type { LLMProvider, ProviderMessage, ProviderStreamEvent } from '../provider/provider.types.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import { conversationMessagesToProviderMessages } from '../conversation/transcript-bridge.js'
import { trimConversationToFit } from '../conversation/context-window.js'
import type { ConversationMessage } from '../conversation/conversation.types.js'

function createToolContext(): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: {
      mode: 'APPROVED_EXECUTION',
      allowNetwork: false,
      allowShell: false,
      allowWrites: false,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: [],
    },
  }
}

function makeTextResponse(text: string): ProviderStreamEvent[] {
  return [
    { type: 'text_delta', text },
    {
      type: 'message_stop',
      stopReason: 'end_turn',
      usage: { inputTokens: 100, outputTokens: 50 },
    },
  ]
}

function createMessage(role: ConversationMessage['role'], content: string): ConversationMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

describe('conversation-e2e', () => {
  describe('multi-turn conversation with mock provider', () => {
    it('accumulates messages across three turns', async () => {
      const capturedMessageSets: ProviderMessage[][] = []
      let callIndex = 0
      const responses = [
        makeTextResponse('CodeMind is a governed AI coding agent.'),
        makeTextResponse('It uses a policy-gated runtime with tool capabilities.'),
        makeTextResponse('Yes, it supports GitHub live read and write operations.'),
      ]

      const provider: LLMProvider = {
        providerId: 'mock',
        displayName: 'Mock Provider',
        async *complete(messages) {
          capturedMessageSets.push([...messages])
          const events = responses[callIndex] ?? responses[responses.length - 1]!
          callIndex++
          for (const event of events) {
            yield event
          }
        },
      }

      const config: AgentLoopConfig = {
        maxIterations: 5,
        systemPrompt: 'You are CodeMind.',
      }

      const conversationHistory: ConversationMessage[] = []
      const toolContext = createToolContext()

      const result1 = await runAgentLoop(provider, 'What is CodeMind?', [], toolContext, config)
      conversationHistory.push(createMessage('user', 'What is CodeMind?'))
      conversationHistory.push(createMessage('assistant', result1.finalText))

      const priorMessages2 = conversationMessagesToProviderMessages(conversationHistory)
      const config2: AgentLoopConfig = { ...config, priorMessages: priorMessages2 }
      const result2 = await runAgentLoop(provider, 'How does it work?', [], toolContext, config2)
      conversationHistory.push(createMessage('user', 'How does it work?'))
      conversationHistory.push(createMessage('assistant', result2.finalText))

      const priorMessages3 = conversationMessagesToProviderMessages(conversationHistory)
      const config3: AgentLoopConfig = { ...config, priorMessages: priorMessages3 }
      const result3 = await runAgentLoop(provider, 'Does it support GitHub?', [], toolContext, config3)

      expect(result1.finalText).toContain('governed AI coding agent')
      expect(result2.finalText).toContain('policy-gated runtime')
      expect(result3.finalText).toContain('GitHub live read')

      expect(capturedMessageSets[0]).toHaveLength(1)
      expect(capturedMessageSets[1]).toHaveLength(3)
      expect(capturedMessageSets[2]).toHaveLength(5)

      expect(capturedMessageSets[2]![0]!.role).toBe('user')
      expect(capturedMessageSets[2]![1]!.role).toBe('assistant')
      expect(capturedMessageSets[2]![2]!.role).toBe('user')
      expect(capturedMessageSets[2]![3]!.role).toBe('assistant')
      expect(capturedMessageSets[2]![4]!.role).toBe('user')
    })

    it('conversation history compacts when exceeding context window', () => {
      const history: ConversationMessage[] = []
      for (let i = 0; i < 100; i++) {
        history.push(createMessage('user', `Message ${i}: ${'x'.repeat(500)}`))
        history.push(createMessage('assistant', `Reply ${i}: ${'y'.repeat(500)}`))
      }

      const trimmed = trimConversationToFit(history, {
        modelContextLimit: 1000,
        systemPromptReserve: 0,
        toolSchemaReserve: 0,
        responseReserve: 0,
      })

      expect(trimmed.length).toBeLessThan(history.length)
      expect(trimmed.length).toBeGreaterThan(0)

      const providerMessages = conversationMessagesToProviderMessages(trimmed)
      expect(providerMessages.length).toBe(trimmed.length)
    })

    it('session resume restores conversation context', async () => {
      let capturedMessages: ProviderMessage[] = []
      const provider: LLMProvider = {
        providerId: 'mock',
        displayName: 'Mock Provider',
        async *complete(messages) {
          capturedMessages = [...messages]
          yield { type: 'text_delta' as const, text: 'Continuing where we left off.' }
          yield {
            type: 'message_stop' as const,
            stopReason: 'end_turn' as const,
            usage: { inputTokens: 100, outputTokens: 20 },
          }
        },
      }

      const persistedMessages: ConversationMessage[] = [
        createMessage('user', 'What files are in the project?'),
        createMessage('assistant', 'There are 530 TypeScript files.'),
        createMessage('user', 'How many tests?'),
        createMessage('assistant', 'There are 192 spec files with 1935 tests.'),
      ]

      const priorMessages = conversationMessagesToProviderMessages(persistedMessages)
      const config: AgentLoopConfig = {
        maxIterations: 5,
        systemPrompt: 'You are CodeMind.',
        priorMessages,
      }

      const result = await runAgentLoop(
        provider,
        'What is the test coverage?',
        [],
        createToolContext(),
        config,
      )

      expect(result.status).toBe('completed')
      expect(capturedMessages).toHaveLength(5)
      expect(capturedMessages[0]!.content).toBe('What files are in the project?')
      expect(capturedMessages[3]!.content).toBe('There are 192 spec files with 1935 tests.')
      expect(capturedMessages[4]!.content).toBe('What is the test coverage?')
    })

    it('clear resets conversation history', () => {
      const history: ConversationMessage[] = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi'),
      ]

      history.length = 0

      const providerMessages = conversationMessagesToProviderMessages(history)
      expect(providerMessages).toHaveLength(0)
    })
  })
})
