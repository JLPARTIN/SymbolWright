import type { ContextBudgeter } from './context-budgeter.js'
import type { ProceduralMemory } from './procedural-memory.js'
import type { RetrievalEngine } from './retrieval-engine.js'
import type { MemoryDatabase } from './storage/database.js'
import type { LocalLexicalStore } from './storage/lexical-store.js'

export type AgentMemoryStoreType = 'episodic' | 'lexical' | 'procedural'

export class AgentMemoryTools {
  constructor(
    private readonly db: MemoryDatabase,
    private readonly lexicalStore: LocalLexicalStore,
    private readonly proceduralMemory: ProceduralMemory,
    private readonly retrievalEngine: RetrievalEngine,
    private readonly budgeter: ContextBudgeter,
  ) {}

  public memory_recall(query: string, changedFiles: readonly string[] = []): string {
    const budget = this.budgeter.calculateBudgets(this.proceduralMemory, 0).memoryRetrievalBudget
    const results = this.retrievalEngine.retrieve(query, Math.min(budget, 4000), changedFiles)

    if (results.length === 0) return 'No relevant memories found.'

    return results
      .map(
        (result) =>
          `[${result.source.toUpperCase()}:${result.id}] (Score: ${result.score.toFixed(2)})\n${result.content}`,
      )
      .join('\n\n')
  }

  public memory_store(
    type: AgentMemoryStoreType,
    content: string,
    metadata: Record<string, unknown> = {},
  ): string {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const now = Date.now()

    if (type === 'episodic') {
      this.db
        .getDb()
        .prepare(
          `
            INSERT INTO episodic_interactions
              (id, timestamp, type, content, relevance_score, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(id, now, 'user_correction', content, 1.0, now)
    } else if (type === 'lexical') {
      this.lexicalStore.add(id, content, metadata)
    } else {
      this.proceduralMemory.addRule('repo_conventions', content)
    }

    return `Memory stored successfully with ID: ${id}`
  }
}
