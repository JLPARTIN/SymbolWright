import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_DB_DIR = resolve(process.cwd(), '.symbolwright/memory')
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'symbolwright.db')
const LEGACY_DB_FILENAME = 'codemind.db'

export type EpisodicInteractionType =
  | 'pr_history'
  | 'user_correction'
  | 'mistake_resolution'
  | 'session_summary'

export interface EpisodicInteractionRecord {
  readonly id: string
  readonly timestamp: number
  readonly type: EpisodicInteractionType
  readonly content: string
  readonly relevance_score: number
  readonly last_accessed: number
}

export interface GraphNodeRecord {
  readonly id: string
  readonly type: 'file' | 'module' | 'concept'
  readonly metadata: string | null
}

export interface GraphEdgeRecord {
  readonly source_id: string
  readonly target_id: string
  readonly relationship: 'imports' | 'depends_on' | 'relates_to'
}

export interface ArchivedMemoryRecord {
  readonly id: string
  readonly original_table: string
  readonly archived_at: number
  readonly data: string
}

export class MemoryDatabase {
  private readonly db: DatabaseSync

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // A directory-level .symbolwright -> .symbolwright migration may have copied
    // over a legacy-named `symbolwright.db` file without renaming it. Adopt it
    // in place (once) so existing memory data isn't orphaned under the new
    // canonical filename.
    if (!existsSync(dbPath)) {
      const legacyPath = join(dir, LEGACY_DB_FILENAME)
      if (existsSync(legacyPath)) {
        renameSync(legacyPath, dbPath)
      }
    }

    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.initializeSchema()
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodic_interactions (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        relevance_score REAL DEFAULT 1.0,
        last_accessed INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS graph_edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship TEXT NOT NULL,
        PRIMARY KEY (source_id, target_id, relationship)
      );

      CREATE TABLE IF NOT EXISTS archived_memories (
        id TEXT PRIMARY KEY,
        original_table TEXT NOT NULL,
        archived_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS lexical_store USING fts5(
        id UNINDEXED,
        text,
        metadata UNINDEXED,
        timestamp UNINDEXED,
        tokenize='porter unicode61'
      );

      CREATE INDEX IF NOT EXISTS idx_episodic_access
        ON episodic_interactions(last_accessed);

      CREATE INDEX IF NOT EXISTS idx_episodic_relevance
        ON episodic_interactions(relevance_score);

      CREATE INDEX IF NOT EXISTS idx_graph_edges_source
        ON graph_edges(source_id);

      CREATE INDEX IF NOT EXISTS idx_graph_edges_target
        ON graph_edges(target_id);
    `)
  }

  public getDb(): DatabaseSync {
    return this.db
  }

  public close(): void {
    this.db.close()
  }
}
