export interface VectorEntry {
  readonly id: string
  readonly filePath: string
  readonly chunk: string
  readonly embedding: readonly number[]
  readonly metadata: VectorEntryMetadata
}

export interface VectorEntryMetadata {
  readonly language?: string
  readonly lineStart?: number
  readonly lineEnd?: number
  readonly lastModified?: string
}

export interface VectorSearchResult {
  readonly entry: VectorEntry
  readonly score: number
}

export interface VectorStoreConfig {
  readonly dimensions: number
  readonly maxEntries?: number
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] as number
    const bi = b[i] as number
    dotProduct += ai * bi
    normA += ai * ai
    normB += bi * bi
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

export class VectorStore {
  private readonly entries = new Map<string, VectorEntry>()
  private readonly dimensions: number
  private readonly maxEntries: number

  constructor(config: VectorStoreConfig) {
    this.dimensions = config.dimensions
    this.maxEntries = config.maxEntries ?? 50000
  }

  add(entry: VectorEntry): void {
    if (entry.embedding.length !== this.dimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimensions}, got ${entry.embedding.length}`)
    }

    if (this.entries.size >= this.maxEntries && !this.entries.has(entry.id)) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) {
        this.entries.delete(oldest.value)
      }
    }

    this.entries.set(entry.id, entry)
  }

  addAll(entries: readonly VectorEntry[]): void {
    for (const entry of entries) {
      this.add(entry)
    }
  }

  remove(id: string): boolean {
    return this.entries.delete(id)
  }

  removeByFilePath(filePath: string): number {
    let removed = 0
    for (const [id, entry] of this.entries) {
      if (entry.filePath === filePath) {
        this.entries.delete(id)
        removed++
      }
    }
    return removed
  }

  search(queryEmbedding: readonly number[], topK: number = 10): readonly VectorSearchResult[] {
    if (queryEmbedding.length !== this.dimensions) {
      throw new Error(`Query dimension mismatch: expected ${this.dimensions}, got ${queryEmbedding.length}`)
    }

    const results: VectorSearchResult[] = []

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding)
      results.push({ entry, score })
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  get(id: string): VectorEntry | undefined {
    return this.entries.get(id)
  }

  size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  listFilePaths(): readonly string[] {
    const paths = new Set<string>()
    for (const entry of this.entries.values()) {
      paths.add(entry.filePath)
    }
    return [...paths]
  }
}
