import { describe, expect, it, beforeEach } from 'vitest'

import { VectorStore, cosineSimilarity } from './vector-store.js'
import type { VectorEntry } from './vector-store.js'

function makeEntry(id: string, embedding: readonly number[], filePath: string = 'test.ts'): VectorEntry {
  return {
    id,
    filePath,
    chunk: `chunk for ${id}`,
    embedding,
    metadata: { lineStart: 1, lineEnd: 10 },
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('returns 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0)
  })

  it('computes correct similarity for non-trivial vectors', () => {
    const a = [1, 2, 3]
    const b = [4, 5, 6]
    const dot = 1 * 4 + 2 * 5 + 3 * 6
    const normA = Math.sqrt(1 + 4 + 9)
    const normB = Math.sqrt(16 + 25 + 36)
    expect(cosineSimilarity(a, b)).toBeCloseTo(dot / (normA * normB))
  })
})

describe('VectorStore', () => {
  let store: VectorStore

  beforeEach(() => {
    store = new VectorStore({ dimensions: 3 })
  })

  it('starts empty', () => {
    expect(store.size()).toBe(0)
  })

  it('adds and retrieves an entry', () => {
    const entry = makeEntry('e1', [1, 0, 0])
    store.add(entry)
    expect(store.size()).toBe(1)
    expect(store.get('e1')).toEqual(entry)
  })

  it('throws on dimension mismatch when adding', () => {
    expect(() => store.add(makeEntry('e1', [1, 0]))).toThrow('dimension mismatch')
  })

  it('overwrites entry with same id', () => {
    store.add(makeEntry('e1', [1, 0, 0]))
    store.add(makeEntry('e1', [0, 1, 0]))
    expect(store.size()).toBe(1)
    expect(store.get('e1')!.embedding).toEqual([0, 1, 0])
  })

  it('addAll adds multiple entries', () => {
    store.addAll([makeEntry('e1', [1, 0, 0]), makeEntry('e2', [0, 1, 0])])
    expect(store.size()).toBe(2)
  })

  it('removes entry by id', () => {
    store.add(makeEntry('e1', [1, 0, 0]))
    expect(store.remove('e1')).toBe(true)
    expect(store.size()).toBe(0)
    expect(store.remove('e1')).toBe(false)
  })

  it('removes entries by file path', () => {
    store.add(makeEntry('e1', [1, 0, 0], 'a.ts'))
    store.add(makeEntry('e2', [0, 1, 0], 'a.ts'))
    store.add(makeEntry('e3', [0, 0, 1], 'b.ts'))
    expect(store.removeByFilePath('a.ts')).toBe(2)
    expect(store.size()).toBe(1)
  })

  it('search returns results sorted by score', () => {
    store.add(makeEntry('e1', [1, 0, 0]))
    store.add(makeEntry('e2', [0, 1, 0]))
    store.add(makeEntry('e3', [0.9, 0.1, 0]))

    const results = store.search([1, 0, 0])
    expect(results.length).toBe(3)
    expect(results[0]!.entry.id).toBe('e1')
    expect(results[0]!.score).toBeCloseTo(1)
  })

  it('search respects topK', () => {
    store.add(makeEntry('e1', [1, 0, 0]))
    store.add(makeEntry('e2', [0, 1, 0]))
    store.add(makeEntry('e3', [0, 0, 1]))

    const results = store.search([1, 0, 0], 2)
    expect(results.length).toBe(2)
  })

  it('search throws on dimension mismatch', () => {
    store.add(makeEntry('e1', [1, 0, 0]))
    expect(() => store.search([1, 0])).toThrow('dimension mismatch')
  })

  it('get returns undefined for unknown id', () => {
    expect(store.get('missing')).toBeUndefined()
  })

  it('clear removes all entries', () => {
    store.addAll([makeEntry('e1', [1, 0, 0]), makeEntry('e2', [0, 1, 0])])
    store.clear()
    expect(store.size()).toBe(0)
  })

  it('listFilePaths returns unique paths', () => {
    store.add(makeEntry('e1', [1, 0, 0], 'a.ts'))
    store.add(makeEntry('e2', [0, 1, 0], 'a.ts'))
    store.add(makeEntry('e3', [0, 0, 1], 'b.ts'))
    const paths = store.listFilePaths()
    expect(paths).toHaveLength(2)
    expect(paths).toContain('a.ts')
    expect(paths).toContain('b.ts')
  })

  it('evicts oldest entry when maxEntries exceeded', () => {
    const small = new VectorStore({ dimensions: 3, maxEntries: 2 })
    small.add(makeEntry('e1', [1, 0, 0]))
    small.add(makeEntry('e2', [0, 1, 0]))
    small.add(makeEntry('e3', [0, 0, 1]))

    expect(small.size()).toBe(2)
    expect(small.get('e1')).toBeUndefined()
    expect(small.get('e2')).toBeDefined()
    expect(small.get('e3')).toBeDefined()
  })
})
