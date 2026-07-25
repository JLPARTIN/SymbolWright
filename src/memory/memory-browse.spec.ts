import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  listProceduralEntries,
  listRecentEpisodicInteractions,
  openMemoryDatabaseReadOnly,
} from './memory-browse.js'
import { ProceduralMemory } from './procedural-memory.js'
import { resolveProjectMemoryDir } from './project-memory.js'
import { MemoryDatabase } from './storage/database.js'

describe('memory-browse', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'symbolwright-memory-browse-test-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('opens a fresh memory database with no interactions', () => {
    const db = openMemoryDatabaseReadOnly(cwd)
    try {
      expect(listRecentEpisodicInteractions(db)).toEqual([])
    } finally {
      db.close()
    }
  })

  it('lists episodic interactions newest first, respecting the limit', () => {
    const memoryDir = resolveProjectMemoryDir(cwd)
    const db = new MemoryDatabase(join(memoryDir, 'symbolwright.db'))
    try {
      db.getDb()
        .prepare(
          'INSERT INTO episodic_interactions (id, timestamp, type, content, relevance_score, last_accessed) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('a', 1, 'session_summary', 'first', 1, 1)
      db.getDb()
        .prepare(
          'INSERT INTO episodic_interactions (id, timestamp, type, content, relevance_score, last_accessed) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('b', 2, 'user_correction', 'second', 0.5, 2)

      const results = listRecentEpisodicInteractions(db, 1)
      expect(results).toEqual([
        { id: 'b', timestamp: 2, type: 'user_correction', content: 'second', relevanceScore: 0.5 },
      ])
    } finally {
      db.close()
    }
  })

  it('lists procedural entries by category', () => {
    const memoryDir = resolveProjectMemoryDir(cwd)
    const procedural = new ProceduralMemory(join(memoryDir, 'procedures.yaml'))
    procedural.addRule('user_preferences', 'Prefers concise commit messages')
    procedural.addRule('repo_conventions', 'Uses named exports only')

    const entries = listProceduralEntries(cwd)
    expect(entries).toEqual([
      { category: 'user_preferences', rules: ['Prefers concise commit messages'] },
      { category: 'repo_conventions', rules: ['Uses named exports only'] },
    ])
  })

  it('returns empty categories when nothing has been learned yet', () => {
    const entries = listProceduralEntries(cwd)
    expect(entries).toEqual([
      { category: 'user_preferences', rules: [] },
      { category: 'repo_conventions', rules: [] },
    ])
  })
})
