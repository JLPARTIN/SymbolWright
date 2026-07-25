import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { JsonlStore } from '../storage/jsonl-store.js'
import {
  isIndexableFile,
  chunkFileContentSemantic,
  generateChunkId,
  detectLanguage,
} from './chunk-indexer.js'
import type { EmbeddingProvider } from './embedding-provider.js'
import { buildRagContext } from './rag-context-builder.js'
import type { RagContextResult } from './rag-context-builder.js'
import type { VectorStore } from './vector-store.js'

export interface ProjectMemoryEntry {
  readonly id: string
  readonly category: ProjectMemoryCategory
  readonly key: string
  readonly value: string
  readonly confidence: number
  readonly learnedAt: string
  readonly source: string
}

export type ProjectMemoryCategory =
  | 'naming_convention'
  | 'architecture_pattern'
  | 'error_pattern'
  | 'test_pattern'
  | 'dependency_note'
  | 'workflow_preference'
  | 'review_lesson'

export const PROJECT_MEMORY_CATEGORIES: readonly ProjectMemoryCategory[] = [
  'naming_convention',
  'architecture_pattern',
  'error_pattern',
  'test_pattern',
  'dependency_note',
  'workflow_preference',
  'review_lesson',
]

export interface ProjectMemoryQuery {
  readonly category?: ProjectMemoryCategory
  readonly minConfidence?: number
  readonly limit?: number
}

export class ProjectMemory {
  private readonly store: JsonlStore<ProjectMemoryEntry>
  private cache: readonly ProjectMemoryEntry[] | undefined

  constructor(memoryDir: string) {
    this.store = new JsonlStore<ProjectMemoryEntry>({
      filePath: join(memoryDir, 'project-memory.jsonl'),
    })
    this.cache = undefined
  }

  learn(entry: Omit<ProjectMemoryEntry, 'id' | 'learnedAt'>): ProjectMemoryEntry {
    const full: ProjectMemoryEntry = {
      ...entry,
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      learnedAt: new Date().toISOString(),
    }

    const existing = this.loadAll().find(
      (e) => e.category === entry.category && e.key === entry.key,
    )

    if (existing !== undefined) {
      this.update(existing.id, {
        value: entry.value,
        confidence: entry.confidence,
        source: entry.source,
      })
      this.cache = undefined
      return full
    }

    this.store.append(full)
    this.cache = undefined
    return full
  }

  query(query: ProjectMemoryQuery = {}): readonly ProjectMemoryEntry[] {
    let entries = this.loadAll()

    if (query.category !== undefined) {
      entries = entries.filter((e) => e.category === query.category)
    }

    if (query.minConfidence !== undefined) {
      const min = query.minConfidence
      entries = entries.filter((e) => e.confidence >= min)
    }

    entries.sort((a, b) => b.confidence - a.confidence)

    if (query.limit !== undefined) {
      entries = entries.slice(0, query.limit)
    }

    return entries
  }

  recall(category: ProjectMemoryCategory): readonly ProjectMemoryEntry[] {
    return this.query({ category })
  }

  forget(id: string): boolean {
    const all = this.loadAll()
    const filtered = all.filter((e) => e.id !== id)

    if (filtered.length === all.length) return false

    this.store.clear()
    this.store.appendAll(filtered)
    this.cache = undefined
    return true
  }

  summarize(): ProjectMemorySummary {
    const all = this.loadAll()
    const byCategory = new Map<ProjectMemoryCategory, number>()

    for (const entry of all) {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1)
    }

    return {
      totalEntries: all.length,
      byCategory: Object.fromEntries(byCategory) as Partial<Record<ProjectMemoryCategory, number>>,
      oldestEntry: all.length > 0 ? all[0]!.learnedAt : undefined,
      newestEntry: all.length > 0 ? all[all.length - 1]!.learnedAt : undefined,
    }
  }

  buildContextSection(): string {
    const entries = this.query({ minConfidence: 0.5, limit: 20 })

    if (entries.length === 0) return ''

    const lines = ['## Project Memory (Learned Patterns)', '']

    const grouped = new Map<ProjectMemoryCategory, ProjectMemoryEntry[]>()
    for (const entry of entries) {
      const list = grouped.get(entry.category) ?? []
      list.push(entry)
      grouped.set(entry.category, list)
    }

    for (const [category, categoryEntries] of grouped) {
      lines.push(`### ${formatCategory(category)}`)
      for (const entry of categoryEntries) {
        lines.push(`- ${entry.key}: ${entry.value}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  size(): number {
    return this.loadAll().length
  }

  async indexRepository(
    rootDir: string,
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
    options: IndexRepositoryOptions = {},
  ): Promise<IndexRepositoryResult> {
    const excludeDirs = new Set(options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS)
    const maxFiles = options.maxFiles ?? 500

    const filePaths = collectFiles(rootDir, rootDir, excludeDirs, maxFiles)
    let chunksIndexed = 0

    for (const filePath of filePaths) {
      try {
        const content = readFileSync(join(rootDir, filePath), 'utf-8')
        const chunks = chunkFileContentSemantic(filePath, content)

        if (chunks.length === 0) continue

        const texts = chunks.map((c) => c.content)
        const embeddings = await embeddingProvider.embedBatch(texts)

        const language = detectLanguage(filePath)

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]!
          const embeddingResult = embeddings[i]!
          vectorStore.add({
            id: generateChunkId(chunk.filePath, chunk.chunkIndex),
            filePath: chunk.filePath,
            chunk: chunk.content,
            embedding: embeddingResult.embedding,
            metadata: {
              lineStart: chunk.lineStart,
              lineEnd: chunk.lineEnd,
              ...(language !== undefined ? { language } : {}),
            },
          })
          chunksIndexed++
        }
      } catch {
        // skip unreadable files
      }
    }

    return { filesScanned: filePaths.length, chunksIndexed }
  }

  async queryRelevant(
    query: string,
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
  ): Promise<RagContextResult> {
    return buildRagContext(query, vectorStore, embeddingProvider)
  }

  private loadAll(): ProjectMemoryEntry[] {
    if (this.cache === undefined) {
      this.cache = this.store.readAll()
    }
    return [...this.cache]
  }

  private update(
    id: string,
    updates: { readonly value: string; readonly confidence: number; readonly source: string },
  ): void {
    const all = this.loadAll()
    const updated = all.map((e) =>
      e.id === id
        ? {
            ...e,
            value: updates.value,
            confidence: updates.confidence,
            source: updates.source,
            learnedAt: new Date().toISOString(),
          }
        : e,
    )
    this.store.clear()
    this.store.appendAll(updated)
  }
}

export interface ProjectMemorySummary {
  readonly totalEntries: number
  readonly byCategory: Partial<Record<ProjectMemoryCategory, number>>
  readonly oldestEntry: string | undefined
  readonly newestEntry: string | undefined
}

function formatCategory(category: ProjectMemoryCategory): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface IndexRepositoryOptions {
  readonly excludeDirs?: readonly string[]
  readonly maxFiles?: number
}

export interface IndexRepositoryResult {
  readonly filesScanned: number
  readonly chunksIndexed: number
}

const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '__pycache__',
  '.venv',
  'vendor',
  'target',
  '.symbolwright',
  '.symbolwright',
]

function collectFiles(
  rootDir: string,
  currentDir: string,
  excludeDirs: Set<string>,
  maxFiles: number,
  collected: string[] = [],
): string[] {
  if (collected.length >= maxFiles) return collected

  let entries: string[]
  try {
    entries = readdirSync(currentDir)
  } catch {
    return collected
  }

  for (const entry of entries) {
    if (collected.length >= maxFiles) break

    const fullPath = join(currentDir, entry)
    const relPath = relative(rootDir, fullPath)

    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        if (!excludeDirs.has(entry)) {
          collectFiles(rootDir, fullPath, excludeDirs, maxFiles, collected)
        }
      } else if (stat.isFile() && isIndexableFile(entry)) {
        collected.push(relPath)
      }
    } catch {
      // skip inaccessible entries
    }
  }

  return collected
}

export function resolveProjectMemoryDir(workspaceCwd: string): string {
  return join(workspaceCwd, '.symbolwright', 'memory')
}
