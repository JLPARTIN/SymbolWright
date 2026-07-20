import { describe, expect, it, vi } from 'vitest'

import { AgentMemoryTools } from './agent-tools.js'

describe('mission-compatible memory evidence', () => {
  it('includes stable source ids in recall output', () => {
    const retrievalEngine = {
      retrieve: vi.fn(() => [
        { id: 'mem-123', source: 'episodic', score: 0.9, content: 'Remember this' },
      ]),
    }
    const tools = new AgentMemoryTools(
      {} as never,
      {} as never,
      { addRule: vi.fn() } as never,
      retrievalEngine as never,
      { calculateBudgets: vi.fn(() => ({ memoryRetrievalBudget: 1000 })) } as never,
    )
    expect(tools.memory_recall('remember')).toContain('[EPISODIC:mem-123]')
  })
})
