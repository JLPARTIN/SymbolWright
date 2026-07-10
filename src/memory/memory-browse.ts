import { join } from 'node:path'

import { ProceduralMemory } from './procedural-memory.js'
import { resolveProjectMemoryDir } from './project-memory.js'
import type { EpisodicInteractionRecord } from './storage/database.js'
import { MemoryDatabase } from './storage/database.js'

/**
 * Opens the project's memory database for passive browsing only. Unlike
 * `initializeAgentMemorySession`, this does not require a live `LLMProvider`
 * (no `ConsolidationEngine` is wired) — it exists purely so a read-only UI
 * view can list what memory already exists without paying for an agent
 * session. Opening a `MemoryDatabase` creates its directory/schema if
 * missing, so this is safe to call even on a checkout that has never run
 * an agent session; it will simply return empty results.
 */
export function openMemoryDatabaseReadOnly(cwd: string): MemoryDatabase {
  const memoryDir = resolveProjectMemoryDir(cwd)
  return new MemoryDatabase(join(memoryDir, 'codemind.db'))
}

export interface EpisodicSummary {
  readonly id: string
  readonly timestamp: number
  readonly type: EpisodicInteractionRecord['type']
  readonly content: string
  readonly relevanceScore: number
}

/** Lists the most recent episodic interactions, newest first. */
export function listRecentEpisodicInteractions(
  db: MemoryDatabase,
  limit = 50,
): readonly EpisodicSummary[] {
  const rows = db
    .getDb()
    .prepare(
      'SELECT id, timestamp, type, content, relevance_score FROM episodic_interactions ORDER BY timestamp DESC LIMIT ?',
    )
    .all(limit) as unknown as readonly {
    id: string
    timestamp: number
    type: EpisodicInteractionRecord['type']
    content: string
    relevance_score: number
  }[]

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    content: row.content,
    relevanceScore: row.relevance_score,
  }))
}

export interface ProceduralSummary {
  readonly category: 'user_preferences' | 'repo_conventions'
  readonly rules: readonly string[]
}

/** Lists procedural memory rules by category (file-backed `procedures.yaml`, no provider needed). */
export function listProceduralEntries(cwd: string): readonly ProceduralSummary[] {
  const memoryDir = resolveProjectMemoryDir(cwd)
  const procedural = new ProceduralMemory(join(memoryDir, 'procedures.yaml'))
  const schema = procedural.getSchema()

  return [
    { category: 'user_preferences', rules: schema.user_preferences },
    { category: 'repo_conventions', rules: schema.repo_conventions },
  ]
}
