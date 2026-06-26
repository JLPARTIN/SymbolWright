import { JsonlStore } from '../storage/jsonl-store.js'
import { join } from 'node:path'

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
        ? { ...e, value: updates.value, confidence: updates.confidence, source: updates.source, learnedAt: new Date().toISOString() }
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

export function resolveProjectMemoryDir(workspaceCwd: string): string {
  return join(workspaceCwd, '.codemind', 'memory')
}
