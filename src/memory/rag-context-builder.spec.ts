import { describe, expect, it } from 'vitest'

import { buildRagContext } from './rag-context-builder.js'
import { VectorStore } from './vector-store.js'
import { createHashEmbeddingProvider } from './embedding-provider.js'
import type { RagContextConfig } from './rag-context-builder.js'

function createPopulatedStore(dimensions: number): VectorStore {
  const store = new VectorStore({ dimensions })

  const chunks = [
    { id: 'f1#0', filePath: 'auth.ts', chunk: 'function login(user: string) { return true; }', lineStart: 1, lineEnd: 5 },
    { id: 'f1#1', filePath: 'auth.ts', chunk: 'function logout() { session.clear(); }', lineStart: 6, lineEnd: 10 },
    { id: 'f2#0', filePath: 'db.ts', chunk: 'const pool = createPool({ host: "localhost" });', lineStart: 1, lineEnd: 3 },
  ]

  for (const c of chunks) {
    const embedding = hashEmbedSync(c.chunk, dimensions)
    store.add({
      id: c.id,
      filePath: c.filePath,
      chunk: c.chunk,
      embedding,
      metadata: { lineStart: c.lineStart, lineEnd: c.lineEnd },
    })
  }

  return store
}

function hashEmbedSync(text: string, dimensions: number): readonly number[] {
  const result = new Float64Array(dimensions)
  const words = text.toLowerCase().split(/\s+/)

  for (const word of words) {
    let hash = 0
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0
    }
    const index = Math.abs(hash) % dimensions
    result[index] = (result[index] as number) + 1
  }

  let norm = 0
  for (let i = 0; i < dimensions; i++) {
    norm += (result[i] as number) * (result[i] as number)
  }
  norm = Math.sqrt(norm)

  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      result[i] = (result[i] as number) / norm
    }
  }

  return Array.from(result)
}

describe('buildRagContext', () => {
  const dimensions = 64
  const embeddingProvider = createHashEmbeddingProvider(dimensions)

  it('returns empty result for empty store', async () => {
    const store = new VectorStore({ dimensions })
    const result = await buildRagContext('test query', store, embeddingProvider)

    expect(result.contextText).toBe('')
    expect(result.chunksUsed).toBe(0)
    expect(result.totalTokenEstimate).toBe(0)
    expect(result.sources).toHaveLength(0)
  })

  it('returns context with relevant chunks', async () => {
    const store = createPopulatedStore(dimensions)
    const config: RagContextConfig = {
      maxChunks: 10,
      maxTokenBudget: 4000,
      minScore: 0,
      charsPerToken: 4,
    }
    const result = await buildRagContext('login authentication', store, embeddingProvider, config)

    expect(result.chunksUsed).toBeGreaterThan(0)
    expect(result.contextText).toContain('## Relevant Code Context')
    expect(result.sources.length).toBeGreaterThan(0)
  })

  it('includes file path and line info in context', async () => {
    const store = createPopulatedStore(dimensions)
    const result = await buildRagContext('login', store, embeddingProvider)

    if (result.chunksUsed > 0) {
      expect(result.contextText).toContain('###')
      expect(result.contextText).toContain('```')
    }
  })

  it('respects maxChunks config', async () => {
    const store = createPopulatedStore(dimensions)
    const config: RagContextConfig = {
      maxChunks: 1,
      maxTokenBudget: 4000,
      minScore: 0,
      charsPerToken: 4,
    }
    const result = await buildRagContext('test', store, embeddingProvider, config)

    expect(result.chunksUsed).toBeLessThanOrEqual(1)
  })

  it('respects minScore config', async () => {
    const store = createPopulatedStore(dimensions)
    const config: RagContextConfig = {
      maxChunks: 10,
      maxTokenBudget: 4000,
      minScore: 0.99,
      charsPerToken: 4,
    }
    const result = await buildRagContext('unrelated gibberish xyzzy', store, embeddingProvider, config)

    for (const source of result.sources) {
      expect(source.score).toBeGreaterThanOrEqual(0.99)
    }
  })

  it('estimates token count', async () => {
    const store = createPopulatedStore(dimensions)
    const result = await buildRagContext('login', store, embeddingProvider)

    if (result.chunksUsed > 0) {
      expect(result.totalTokenEstimate).toBeGreaterThan(0)
      expect(result.totalTokenEstimate).toBe(Math.ceil(result.contextText.length / 4))
    }
  })

  it('sources include file path and score', async () => {
    const store = createPopulatedStore(dimensions)
    const result = await buildRagContext('login auth', store, embeddingProvider)

    for (const source of result.sources) {
      expect(source.filePath).toBeTruthy()
      expect(typeof source.score).toBe('number')
    }
  })

  it('respects token budget', async () => {
    const store = createPopulatedStore(dimensions)
    const config: RagContextConfig = {
      maxChunks: 10,
      maxTokenBudget: 5,
      minScore: 0,
      charsPerToken: 4,
    }
    const result = await buildRagContext('test', store, embeddingProvider, config)

    expect(result.chunksUsed).toBeLessThanOrEqual(1)
  })
})
