import { ShortTermMemory } from './short-term-memory.js'
import type { SessionMessage } from './short-term-memory.js'
import { MemoryDatabase } from './storage/database.js'

export interface LLMProvider {
  generate(prompt: string): Promise<string>
}

export class ConsolidationEngine {
  constructor(
    private readonly shortTermMemory: ShortTermMemory,
    private readonly db: MemoryDatabase,
    private readonly llm: LLMProvider,
  ) {}

  public async runConsolidationIfNeeded(): Promise<void> {
    if (!this.shortTermMemory.needsConsolidation()) return

    const messagesToSummarize = this.shortTermMemory.extractOldestMessages(3)
    if (messagesToSummarize.length === 0) return

    const summary = await this.summarizeMessages(messagesToSummarize)
    this.storeSummaryInEpisodic(summary)
  }

  private async summarizeMessages(messages: readonly SessionMessage[]): Promise<string> {
    const transcript = messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n')

    const prompt = `
Summarize the following conversation transcript into a concise, factual "Session Summary".
Focus on key decisions, code changes, and user corrections. Keep it under 200 words.

Transcript:
${transcript}
`.trim()

    return this.llm.generate(prompt)
  }

  private storeSummaryInEpisodic(summary: string): void {
    const id = `summary-${Date.now()}`
    const now = Date.now()
    this.db
      .getDb()
      .prepare(
        `
          INSERT INTO episodic_interactions
            (id, timestamp, type, content, relevance_score, last_accessed)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(id, now, 'session_summary', summary, 0.8, now)
  }
}
