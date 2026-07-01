import type { ContextBudgeter, MemoryCandidate } from './context-budgeter.js'
import type { MemoryDatabase } from './storage/database.js'
import type { LocalLexicalStore } from './storage/lexical-store.js'

interface EpisodicRow {
  readonly id: string
  readonly content: string
  readonly timestamp: number
  readonly relevance_score: number
}

interface GraphRow {
  readonly id: string
  readonly metadata: string | null
}

export class RetrievalEngine {
  constructor(
    private readonly db: MemoryDatabase,
    private readonly lexicalStore: LocalLexicalStore,
    private readonly budgeter: ContextBudgeter,
  ) {}

  public retrieve(
    query: string,
    budgetTokens: number,
    changedFiles: readonly string[] = [],
  ): readonly MemoryCandidate[] {
    const candidates: MemoryCandidate[] = []
    const now = Date.now()
    const thirtyDays = 30 * 24 * 60 * 60 * 1000

    for (const result of this.lexicalStore.search(query, 5)) {
      candidates.push({
        id: result.id,
        content: result.text,
        score: result.score * 0.5,
        source: 'lexical',
      })
    }

    const episodicRows = this.db
      .getDb()
      .prepare(
        `
          SELECT id, content, timestamp, relevance_score
          FROM episodic_interactions
          WHERE last_accessed > ? AND lower(content) LIKE lower(?)
          ORDER BY relevance_score DESC, timestamp DESC
          LIMIT 10
        `,
      )
      .all(now - thirtyDays, `%${this.cleanLikeQuery(query)}%`) as unknown as EpisodicRow[]

    for (const row of episodicRows) {
      const recencyScore = Math.max(0, 1 - (now - row.timestamp) / thirtyDays)
      candidates.push({
        id: row.id,
        content: row.content,
        score: recencyScore * 0.3 + row.relevance_score * 0.2,
        source: 'episodic',
      })
    }

    if (changedFiles.length > 0) {
      const placeholders = changedFiles.map(() => '?').join(',')
      const graphRows = this.db
        .getDb()
        .prepare(
          `
            SELECT n.id, n.metadata
            FROM graph_nodes n
            JOIN graph_edges e ON n.id = e.target_id
            WHERE e.source_id IN (${placeholders})
          `,
        )
        .all(...changedFiles) as unknown as GraphRow[]

      for (const row of graphRows) {
        const metadataText = row.metadata === null ? '' : ` ${row.metadata}`
        candidates.push({
          id: row.id,
          content: `Related dependency: ${row.id}${metadataText}`,
          score: 0.8,
          source: 'graph',
        })
      }
    }

    this.updateLastAccessed(
      now,
      candidates.filter((candidate) => candidate.source === 'episodic').map((candidate) => candidate.id),
    )

    return this.budgeter.truncateToBudget(candidates, budgetTokens)
  }

  private updateLastAccessed(now: number, ids: readonly string[]): void {
    if (ids.length === 0) return

    const dbInstance = this.db.getDb()
    const stmt = dbInstance.prepare('UPDATE episodic_interactions SET last_accessed = ? WHERE id = ?')

    dbInstance.exec('BEGIN')
    try {
      for (const id of ids) {
        stmt.run(now, id)
      }
      dbInstance.exec('COMMIT')
    } catch (error) {
      dbInstance.exec('ROLLBACK')
      throw error
    }
  }

  private cleanLikeQuery(input: string): string {
    return input.replaceAll('%', '').replaceAll('_', '').trim()
  }
}
