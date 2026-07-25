import { join } from 'node:path'

import type { LLMProvider } from '../provider/provider.types.js'
import { AgentMemoryTools } from './agent-tools.js'
import { ConsolidationEngine } from './consolidation-engine.js'
import { ContextBudgeter } from './context-budgeter.js'
import { DecayManager } from './decay-manager.js'
import { migrateLegacyLedger, type LegacyLedgerMigrationResult } from './migration.js'
import { createMemoryLlmAdapter } from './provider-llm-adapter.js'
import { ProceduralMemory } from './procedural-memory.js'
import { resolveProjectMemoryDir } from './project-memory.js'
import { RetrievalEngine } from './retrieval-engine.js'
import { ShortTermMemory, type SessionMessage } from './short-term-memory.js'
import { MemoryDatabase } from './storage/database.js'
import { LocalLexicalStore } from './storage/lexical-store.js'

export interface AgentMemorySession {
  readonly tools: AgentMemoryTools
  readonly migrationResult: LegacyLedgerMigrationResult
  recordTurn(message: SessionMessage): Promise<void>
  runMaintenance(): number
  close(): void
}

/**
 * Wires the local-first cognitive memory architecture (episodic/lexical/procedural storage,
 * retrieval, consolidation, and decay) into a live agent session, and migrates any legacy
 * CI-failure-ledger data into episodic memory on first use.
 */
export function initializeAgentMemorySession(
  cwd: string,
  provider: LLMProvider,
): AgentMemorySession {
  const memoryDir = resolveProjectMemoryDir(cwd)
  const db = new MemoryDatabase(join(memoryDir, 'symbolwright.db'))
  const lexicalStore = new LocalLexicalStore(db)
  const proceduralMemory = new ProceduralMemory(join(memoryDir, 'procedures.yaml'))
  const budgeter = new ContextBudgeter()
  const retrievalEngine = new RetrievalEngine(db, lexicalStore, budgeter)
  const tools = new AgentMemoryTools(db, lexicalStore, proceduralMemory, retrievalEngine, budgeter)
  const decayManager = new DecayManager(db)
  const shortTermMemory = new ShortTermMemory()
  const consolidationEngine = new ConsolidationEngine(
    shortTermMemory,
    db,
    createMemoryLlmAdapter(provider),
  )

  const legacyLedgerPath = join(cwd, '.symbolwright', 'ci-failure-ledger.json')
  const migrationResult = migrateLegacyLedger(db, legacyLedgerPath)

  return {
    tools,
    migrationResult,
    async recordTurn(message: SessionMessage): Promise<void> {
      shortTermMemory.addMessage(message)
      await consolidationEngine.runConsolidationIfNeeded()
    },
    runMaintenance(): number {
      return decayManager.runDecayCycle()
    },
    close(): void {
      db.close()
    },
  }
}
