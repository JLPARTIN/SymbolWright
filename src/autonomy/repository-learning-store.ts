import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type RepositoryLearningOutcome = 'successful' | 'failed'

export interface RepositoryLearningEntry {
  readonly id: string
  readonly repositoryId: string
  readonly objectivePattern: string
  readonly validationPhase: string
  readonly diagnosis: readonly string[]
  readonly strategy: string
  readonly affectedFiles: readonly string[]
  readonly outcome: RepositoryLearningOutcome
  readonly attemptCount: number
  readonly createdAt: string
  readonly lastUsedAt?: string | undefined
  readonly useCount: number
}

export interface RepositoryLearningSnapshot {
  readonly schemaVersion: 1
  readonly repositoryId: string
  readonly conventions: readonly string[]
  readonly validationCommands: readonly string[]
  readonly entries: readonly RepositoryLearningEntry[]
  readonly updatedAt: string
}

export class JsonRepositoryLearningStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.codemind', 'autonomy', 'repository-learning')
  }

  async load(repositoryId: string): Promise<RepositoryLearningSnapshot> {
    const id = validateId(repositoryId)
    try {
      const raw = await readFile(path.join(this.#root, `${id}.json`), 'utf8')
      return JSON.parse(raw) as RepositoryLearningSnapshot
    } catch (error) {
      if (!isMissing(error)) throw error
      return {
        schemaVersion: 1,
        repositoryId,
        conventions: [],
        validationCommands: [],
        entries: [],
        updatedAt: new Date().toISOString(),
      }
    }
  }

  async save(snapshot: RepositoryLearningSnapshot): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(snapshot.repositoryId)}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }

  async record(input: {
    readonly repositoryId: string
    readonly objectivePattern: string
    readonly validationPhase: string
    readonly diagnosis: readonly string[]
    readonly strategy: string
    readonly affectedFiles: readonly string[]
    readonly outcome: RepositoryLearningOutcome
    readonly attemptCount: number
    readonly conventions?: readonly string[] | undefined
    readonly validationCommands?: readonly string[] | undefined
    readonly now?: string | undefined
  }): Promise<RepositoryLearningSnapshot> {
    const snapshot = await this.load(input.repositoryId)
    const now = input.now ?? new Date().toISOString()
    const entry: RepositoryLearningEntry = {
      id: `learning-${randomUUID()}`,
      repositoryId: input.repositoryId,
      objectivePattern: normalizeText(input.objectivePattern),
      validationPhase: input.validationPhase,
      diagnosis: [...input.diagnosis],
      strategy: input.strategy,
      affectedFiles: [...new Set(input.affectedFiles)].sort(),
      outcome: input.outcome,
      attemptCount: input.attemptCount,
      createdAt: now,
      useCount: 0,
    }
    const updated: RepositoryLearningSnapshot = {
      ...snapshot,
      conventions: [...new Set([...snapshot.conventions, ...(input.conventions ?? [])])].sort(),
      validationCommands: [
        ...new Set([...snapshot.validationCommands, ...(input.validationCommands ?? [])]),
      ],
      entries: [...snapshot.entries, entry],
      updatedAt: now,
    }
    await this.save(updated)
    return updated
  }

  async recommend(input: {
    readonly repositoryId: string
    readonly objective: string
    readonly validationPhase?: string | undefined
    readonly limit?: number | undefined
    readonly now?: string | undefined
  }): Promise<readonly RepositoryLearningEntry[]> {
    const snapshot = await this.load(input.repositoryId)
    const objectiveTokens = tokenize(input.objective)
    const ranked = snapshot.entries
      .filter((entry) => input.validationPhase === undefined || entry.validationPhase === input.validationPhase)
      .map((entry) => ({ entry, score: scoreEntry(entry, objectiveTokens) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.entry.attemptCount - right.entry.attemptCount)
      .slice(0, input.limit ?? 5)

    if (ranked.length === 0) return []
    const now = input.now ?? new Date().toISOString()
    const selected = new Set(ranked.map((candidate) => candidate.entry.id))
    const updated: RepositoryLearningSnapshot = {
      ...snapshot,
      entries: snapshot.entries.map((entry) =>
        selected.has(entry.id)
          ? { ...entry, lastUsedAt: now, useCount: entry.useCount + 1 }
          : entry,
      ),
      updatedAt: now,
    }
    await this.save(updated)
    return ranked.map((candidate) => ({
      ...candidate.entry,
      lastUsedAt: now,
      useCount: candidate.entry.useCount + 1,
    }))
  }
}

function scoreEntry(entry: RepositoryLearningEntry, objectiveTokens: ReadonlySet<string>): number {
  const patternTokens = tokenize(entry.objectivePattern)
  let overlap = 0
  for (const token of patternTokens) if (objectiveTokens.has(token)) overlap += 1
  if (overlap === 0) return 0
  const outcomeWeight = entry.outcome === 'successful' ? 100 : -25
  const reuseWeight = Math.min(entry.useCount, 10)
  return outcomeWeight + overlap * 10 + reuseWeight - entry.attemptCount
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  )
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid repository learning ID: ${value}`)
  return value
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
