import type { MemoryDatabase } from './storage/database.js'

interface ArchiveCandidateRow {
  readonly id: string
  readonly content: string
}

export class DecayManager {
  constructor(private readonly db: MemoryDatabase) {}

  public runDecayCycle(): number {
    const now = Date.now()
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const dbInstance = this.db.getDb()
    const toArchive = dbInstance
      .prepare(
        `
          SELECT id, content
          FROM episodic_interactions
          WHERE last_accessed < ? AND relevance_score < ?
        `,
      )
      .all(cutoff, 0.3) as unknown as ArchiveCandidateRow[]

    if (toArchive.length === 0) return 0

    const insertArchive = dbInstance.prepare(
      `
        INSERT OR REPLACE INTO archived_memories (id, original_table, archived_at, data)
        VALUES (?, ?, ?, ?)
      `,
    )
    const removeActive = dbInstance.prepare('DELETE FROM episodic_interactions WHERE id = ?')

    dbInstance.exec('BEGIN')
    try {
      for (const item of toArchive) {
        insertArchive.run(item.id, 'episodic_interactions', now, item.content)
        removeActive.run(item.id)
      }
      dbInstance.exec('COMMIT')
    } catch (error) {
      dbInstance.exec('ROLLBACK')
      throw error
    }

    return toArchive.length
  }
}
