import type { MemoryDatabase } from './database.js'

export interface LexicalRecord {
  readonly id: string
  readonly text: string
  readonly metadata: Record<string, unknown>
  readonly timestamp: number
}

interface LexicalStoreRow {
  readonly id: string
  readonly text: string
  readonly metadata: string | null
  readonly timestamp: number
  readonly rank?: number
}

export class LocalLexicalStore {
  constructor(private readonly db: MemoryDatabase) {}

  public add(id: string, text: string, metadata: Record<string, unknown> = {}): void {
    const dbInstance = this.db.getDb()
    dbInstance.prepare('DELETE FROM lexical_store WHERE id = ?').run(id)
    dbInstance
      .prepare('INSERT INTO lexical_store (id, text, metadata, timestamp) VALUES (?, ?, ?, ?)')
      .run(id, text, JSON.stringify(metadata), Date.now())
  }

  public search(query: string, topK = 5): Array<LexicalRecord & { readonly score: number }> {
    const terms = this.tokenizeQuery(query)
    if (terms.length === 0) return this.searchWithLike(query, topK)

    const matchQuery = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ')

    try {
      const rows = this.db
        .getDb()
        .prepare(
          `
            SELECT id, text, metadata, timestamp, rank
            FROM lexical_store
            WHERE lexical_store MATCH ?
            ORDER BY rank
            LIMIT ?
          `,
        )
        .all(matchQuery, topK) as unknown as LexicalStoreRow[]

      return rows.map((row) => this.toRecord(row, this.scoreFromRank(row.rank)))
    } catch {
      return this.searchWithLike(query, topK)
    }
  }

  public delete(id: string): void {
    this.db.getDb().prepare('DELETE FROM lexical_store WHERE id = ?').run(id)
  }

  private tokenizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 20)
  }

  private searchWithLike(
    query: string,
    topK: number,
  ): Array<LexicalRecord & { readonly score: number }> {
    const terms = this.tokenizeQuery(query)
    if (terms.length === 0) return []

    const likeTerm = `%${terms[0] ?? ''}%`
    const rows = this.db
      .getDb()
      .prepare(
        `
          SELECT id, text, metadata, timestamp
          FROM lexical_store
          WHERE text LIKE ?
          LIMIT ?
        `,
      )
      .all(likeTerm, topK) as unknown as LexicalStoreRow[]

    return rows.map((row) => this.toRecord(row, 0.25))
  }

  private toRecord(
    row: LexicalStoreRow,
    score: number,
  ): LexicalRecord & { readonly score: number } {
    return {
      id: row.id,
      text: row.text,
      metadata: this.parseMetadata(row.metadata),
      timestamp: row.timestamp,
      score,
    }
  }

  private parseMetadata(metadata: string | null): Record<string, unknown> {
    if (metadata === null || metadata.trim().length === 0) return {}

    try {
      const parsed = JSON.parse(metadata) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }

    return {}
  }

  private scoreFromRank(rank: number | undefined): number {
    if (rank === undefined) return 0.5
    return 1 / (1 + Math.abs(rank))
  }
}
