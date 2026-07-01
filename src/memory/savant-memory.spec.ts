import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { AgentMemoryTools } from './agent-tools.js'
import { ConsolidationEngine } from './consolidation-engine.js'
import { ContextBudgeter } from './context-budgeter.js'
import { DecayManager } from './decay-manager.js'
import { migrateLegacyLedger } from './migration.js'
import { ProceduralMemory } from './procedural-memory.js'
import { RetrievalEngine } from './retrieval-engine.js'
import { ShortTermMemory } from './short-term-memory.js'
import { MemoryDatabase } from './storage/database.js'
import { LocalLexicalStore } from './storage/lexical-store.js'

describe('Savant Cognitive Memory Architecture', () => {
  let tempDir: string
  let dbPath: string
  let proceduresPath: string
  let legacyLedgerPath: string
  let db: MemoryDatabase
  let lexicalStore: LocalLexicalStore
  let proceduralMemory: ProceduralMemory
  let budgeter: ContextBudgeter
  let retrievalEngine: RetrievalEngine
  let tools: AgentMemoryTools

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'codemind-memory-test-'))
    dbPath = join(tempDir, 'codemind.db')
    proceduresPath = join(tempDir, 'procedures.yaml')
    legacyLedgerPath = join(tempDir, 'ci-failure-ledger.json')

    db = new MemoryDatabase(dbPath)
    lexicalStore = new LocalLexicalStore(db)
    proceduralMemory = new ProceduralMemory(proceduresPath)
    budgeter = new ContextBudgeter(10000)
    retrievalEngine = new RetrievalEngine(db, lexicalStore, budgeter)
    tools = new AgentMemoryTools(db, lexicalStore, proceduralMemory, retrievalEngine, budgeter)
  })

  afterEach(() => {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('initializes the SQLite memory schema locally', () => {
    const rows = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")
      .all() as Array<{ readonly name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toContain('episodic_interactions')
    expect(names).toContain('graph_nodes')
    expect(names).toContain('graph_edges')
    expect(names).toContain('archived_memories')
    expect(names).toContain('lexical_store')
  })

  it('migrates a valid legacy failure ledger and deletes it after success', () => {
    writeFileSync(
      legacyLedgerPath,
      JSON.stringify({
        failures: [
          {
            failureClass: 'FORMAT_CHECK_FAILURE',
            rootCause: 'Prettier mismatch',
            preventionRule: 'Run format check',
            regressionTest: 'format spec',
            firstSeen: '2026-06-30',
          },
        ],
      }),
    )

    const result = migrateLegacyLedger(db, legacyLedgerPath)
    const rows = db
      .getDb()
      .prepare("SELECT content FROM episodic_interactions WHERE type = 'mistake_resolution'")
      .all() as Array<{ readonly content: string }>

    expect(result).toEqual({ status: 'migrated', migratedCount: 1 })
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]!.content)).toMatchObject({
      failureClass: 'FORMAT_CHECK_FAILURE',
    })
    expect(existsSync(legacyLedgerPath)).toBe(false)
  })

  it('preserves a malformed legacy ledger instead of deleting source data', () => {
    writeFileSync(legacyLedgerPath, '{ invalid json')

    const result = migrateLegacyLedger(db, legacyLedgerPath)
    const rows = db.getDb().prepare('SELECT id FROM episodic_interactions').all()

    expect(result).toEqual({ status: 'skipped', reason: 'parse_error' })
    expect(rows).toHaveLength(0)
    expect(existsSync(legacyLedgerPath)).toBe(true)
  })

  it('preserves an invalid legacy ledger shape instead of deleting source data', () => {
    writeFileSync(
      legacyLedgerPath,
      JSON.stringify({ failures: [{ failureClass: 'BROKEN' }] }),
    )

    const result = migrateLegacyLedger(db, legacyLedgerPath)
    const rows = db.getDb().prepare('SELECT id FROM episodic_interactions').all()

    expect(result).toEqual({ status: 'skipped', reason: 'invalid_shape' })
    expect(rows).toHaveLength(0)
    expect(existsSync(legacyLedgerPath)).toBe(true)
  })

  it('triggers short-term consolidation above 70 percent of the context budget', () => {
    const shortTermMemory = new ShortTermMemory(1000)
    shortTermMemory.addMessage({ role: 'user', content: 'a'.repeat(3000) })

    expect(shortTermMemory.needsConsolidation()).toBe(true)
  })

  it('stores a session summary during consolidation', async () => {
    const shortTermMemory = new ShortTermMemory(1000)
    shortTermMemory.addMessage({ role: 'user', content: 'a'.repeat(3000) })
    const mockLlm = { generate: vi.fn().mockResolvedValue('Summary of events.') }
    const engine = new ConsolidationEngine(shortTermMemory, db, mockLlm)

    await engine.runConsolidationIfNeeded()

    const rows = db
      .getDb()
      .prepare("SELECT content FROM episodic_interactions WHERE type = 'session_summary'")
      .all() as Array<{ readonly content: string }>

    expect(mockLlm.generate).toHaveBeenCalledOnce()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toBe('Summary of events.')
  })

  it('persists and reloads procedural rules', () => {
    proceduralMemory.addRule('repo_conventions', 'Always use Zod for validation.')
    const reloaded = new ProceduralMemory(proceduresPath)

    expect(reloaded.getAllRules()).toContain('Always use Zod for validation.')
  })

  it('falls back safely when procedural YAML is malformed', () => {
    writeFileSync(proceduresPath, ':::invalid yaml:::\n  - broken\n:')
    const recovered = new ProceduralMemory(proceduresPath)

    expect(recovered.getAllRules()).toEqual([])
    expect(readFileSync(proceduresPath, 'utf-8')).toContain('user_preferences:')
  })

  it('keeps retrieved memory within the strict token budget', () => {
    lexicalStore.add('short', 'Short text')
    lexicalStore.add('large', 'A'.repeat(4000))

    const results = retrievalEngine.retrieve('text large', 500)
    const totalTokens = results.reduce(
      (sum, result) => sum + Math.ceil(result.content.length / 4),
      0,
    )

    expect(totalTokens).toBeLessThanOrEqual(500)
  })

  it('returns relevant local lexical matches through FTS5', () => {
    lexicalStore.add('doc1', 'The quick brown fox jumps over the lazy dog')
    lexicalStore.add('doc2', 'TypeScript is a strongly typed programming language')

    const results = retrievalEngine.retrieve('fox jumps', 1000)

    expect(results.some((result) => result.content.includes('quick brown fox'))).toBe(true)
  })

  it('handles special FTS query characters without throwing', () => {
    lexicalStore.add('doc1', 'Format check failed because Prettier changed a file')

    expect(() => retrievalEngine.retrieve('"format:(check)* ???', 1000)).not.toThrow()
  })

  it('returns one-hop graph dependencies for changed files', () => {
    db.getDb()
      .prepare("INSERT INTO graph_nodes (id, type, metadata) VALUES ('fileA', 'file', '{}')")
      .run()
    db.getDb()
      .prepare("INSERT INTO graph_nodes (id, type, metadata) VALUES ('fileB', 'file', '{}')")
      .run()
    db.getDb()
      .prepare(
        "INSERT INTO graph_edges (source_id, target_id, relationship) VALUES ('fileA', 'fileB', 'imports')",
      )
      .run()

    const results = retrievalEngine.retrieve('anything', 1000, ['fileA'])

    expect(
      results.some((result) => result.source === 'graph' && result.content.includes('fileB')),
    ).toBe(true)
  })

  it('archives old low-relevance episodic memories', () => {
    const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000
    db.getDb()
      .prepare(
        `
          INSERT INTO episodic_interactions
            (id, timestamp, type, content, relevance_score, last_accessed)
          VALUES ('old1', ?, 'user_correction', 'old stuff', 0.1, ?)
        `,
      )
      .run(oldTimestamp, oldTimestamp)

    const archivedCount = new DecayManager(db).runDecayCycle()
    const activeRows = db
      .getDb()
      .prepare("SELECT id FROM episodic_interactions WHERE id = 'old1'")
      .all()
    const archivedRows = db
      .getDb()
      .prepare("SELECT id FROM archived_memories WHERE id = 'old1'")
      .all()

    expect(archivedCount).toBe(1)
    expect(activeRows).toHaveLength(0)
    expect(archivedRows).toHaveLength(1)
  })

  it('lets agent tools store and recall memories', () => {
    const storeResult = tools.memory_store('episodic', 'User prefers dark mode')

    expect(storeResult).toContain('Memory stored successfully')
    expect(tools.memory_recall('dark mode')).toContain('User prefers dark mode')
  })

  it('uses isolated temp paths only', () => {
    const realCodemindPath = resolve(process.cwd(), '.codemind')
    if (existsSync(realCodemindPath)) {
      expect(existsSync(join(realCodemindPath, 'memory', 'codemind.db'))).toBe(false)
    }

    expect(dbPath.startsWith(tmpdir())).toBe(true)
    expect(proceduresPath.startsWith(tmpdir())).toBe(true)
  })
})
