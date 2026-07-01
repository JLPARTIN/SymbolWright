import type { ProceduralMemory } from './procedural-memory.js'

export interface MemoryCandidate {
  readonly id: string
  readonly content: string
  readonly score: number
  readonly source: 'lexical' | 'episodic' | 'graph'
}

export interface ContextBudgetAllocation {
  readonly proceduralTokens: number
  readonly shortTermTokens: number
  readonly memoryRetrievalBudget: number
}

export class ContextBudgeter {
  constructor(private readonly totalContextTokens = 128000) {}

  public calculateBudgets(
    proceduralMemory: ProceduralMemory,
    shortTermTokens: number,
  ): ContextBudgetAllocation {
    const proceduralText = proceduralMemory.getAllRules().join('\n')
    const proceduralTokens = Math.ceil(proceduralText.length / 4)
    const systemPromptReserve = 2000
    const shortTermReserve = Math.max(shortTermTokens, this.totalContextTokens * 0.4)
    const proceduralReserve = proceduralTokens + systemPromptReserve
    const memoryRetrievalBudget = this.totalContextTokens - shortTermReserve - proceduralReserve

    return {
      proceduralTokens,
      shortTermTokens: shortTermReserve,
      memoryRetrievalBudget: Math.max(0, memoryRetrievalBudget),
    }
  }

  public truncateToBudget(
    candidates: readonly MemoryCandidate[],
    budgetTokens: number,
  ): readonly MemoryCandidate[] {
    const uniqueById = new Map<string, MemoryCandidate>()
    for (const candidate of candidates) {
      const existing = uniqueById.get(candidate.id)
      if (existing === undefined || existing.score < candidate.score) {
        uniqueById.set(candidate.id, candidate)
      }
    }

    const sorted = [...uniqueById.values()].sort((a, b) => b.score - a.score)
    const selected: MemoryCandidate[] = []
    let currentTokens = 0

    for (const candidate of sorted) {
      const tokens = Math.ceil(candidate.content.length / 4)
      if (currentTokens + tokens > budgetTokens) break
      selected.push(candidate)
      currentTokens += tokens
    }

    return selected
  }
}
