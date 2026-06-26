import { describe, expect, it } from 'vitest'

import { createHashEmbeddingProvider } from './embedding-provider.js'

describe('createHashEmbeddingProvider', () => {
  const provider = createHashEmbeddingProvider(64)

  it('has correct provider id', () => {
    expect(provider.providerId).toBe('hash-embedding')
  })

  it('has correct dimensions', () => {
    expect(provider.dimensions).toBe(64)
  })

  it('embed returns correct dimension embedding', async () => {
    const result = await provider.embed('hello world')
    expect(result.embedding).toHaveLength(64)
  })

  it('embed returns token count estimate', async () => {
    const text = 'hello world foo bar'
    const result = await provider.embed(text)
    expect(result.tokenCount).toBe(Math.ceil(text.length / 4))
  })

  it('embed produces normalized vectors', async () => {
    const result = await provider.embed('some test text for embedding')
    let norm = 0
    for (const v of result.embedding) {
      norm += v * v
    }
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5)
  })

  it('embed is deterministic', async () => {
    const r1 = await provider.embed('deterministic test')
    const r2 = await provider.embed('deterministic test')
    expect(r1.embedding).toEqual(r2.embedding)
  })

  it('embed produces different vectors for different text', async () => {
    const r1 = await provider.embed('hello world')
    const r2 = await provider.embed('goodbye universe')
    expect(r1.embedding).not.toEqual(r2.embedding)
  })

  it('embedBatch returns results for each text', async () => {
    const results = await provider.embedBatch(['hello', 'world', 'test'])
    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r.embedding).toHaveLength(64)
    }
  })

  it('embedBatch is consistent with individual embed', async () => {
    const individual = await provider.embed('hello')
    const batch = await provider.embedBatch(['hello'])
    expect(batch[0]!.embedding).toEqual(individual.embedding)
  })

  it('handles empty text', async () => {
    const result = await provider.embed('')
    expect(result.embedding).toHaveLength(64)
    expect(result.tokenCount).toBe(0)
  })

  it('uses default dimensions when not specified', () => {
    const defaultProvider = createHashEmbeddingProvider()
    expect(defaultProvider.dimensions).toBe(256)
  })
})
