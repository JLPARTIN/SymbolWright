import { describe, expect, it, vi, afterEach } from 'vitest'

import { createHashEmbeddingProvider, createVoyageEmbeddingProvider } from './embedding-provider.js'

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

describe('createVoyageEmbeddingProvider', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function mockFetch(status: number, body: unknown): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  }

  it('has correct provider id', () => {
    const provider = createVoyageEmbeddingProvider({ apiKey: 'test-key' })
    expect(provider.providerId).toBe('voyage')
  })

  it('has default dimensions of 1024', () => {
    const provider = createVoyageEmbeddingProvider({ apiKey: 'test-key' })
    expect(provider.dimensions).toBe(1024)
  })

  it('accepts custom dimensions', () => {
    const provider = createVoyageEmbeddingProvider({ apiKey: 'test-key', dimensions: 512 })
    expect(provider.dimensions).toBe(512)
  })

  it('embed sends correct API request', async () => {
    const embedding = Array.from({ length: 1024 }, (_, i) => i * 0.001)
    mockFetch(200, {
      data: [{ embedding }],
      usage: { total_tokens: 5 },
    })

    const provider = createVoyageEmbeddingProvider({ apiKey: 'voyage-test-key' })
    const result = await provider.embed('hello world')

    expect(result.embedding).toEqual(embedding)
    expect(result.tokenCount).toBe(5)

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://api.voyageai.com/v1/embeddings')
    const reqBody = JSON.parse(fetchCall[1].body as string) as { model: string; input: string[] }
    expect(reqBody.model).toBe('voyage-code-3')
    expect(reqBody.input).toEqual(['hello world'])
  })

  it('embedBatch handles multiple texts', async () => {
    const emb1 = Array.from({ length: 1024 }, () => 0.1)
    const emb2 = Array.from({ length: 1024 }, () => 0.2)
    mockFetch(200, {
      data: [{ embedding: emb1 }, { embedding: emb2 }],
      usage: { total_tokens: 10 },
    })

    const provider = createVoyageEmbeddingProvider({ apiKey: 'key' })
    const results = await provider.embedBatch(['text1', 'text2'])

    expect(results).toHaveLength(2)
    expect(results[0]!.embedding).toEqual(emb1)
    expect(results[1]!.embedding).toEqual(emb2)
  })

  it('throws on non-200 status', async () => {
    mockFetch(401, { error: 'Unauthorized' })

    const provider = createVoyageEmbeddingProvider({ apiKey: 'bad-key' })
    await expect(provider.embed('test')).rejects.toThrow('Embedding API returned 401')
  })

  it('throws on malformed response', async () => {
    mockFetch(200, { wrong: 'shape' })

    const provider = createVoyageEmbeddingProvider({ apiKey: 'key' })
    await expect(provider.embed('test')).rejects.toThrow('missing data array')
  })

  it('uses custom baseUrl', async () => {
    const embedding = Array.from({ length: 512 }, () => 0.5)
    mockFetch(200, { data: [{ embedding }], usage: { total_tokens: 3 } })

    const provider = createVoyageEmbeddingProvider({
      apiKey: 'key',
      baseUrl: 'https://custom.api.example.com/v1',
      dimensions: 512,
    })
    await provider.embed('test')

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://custom.api.example.com/v1/embeddings')
  })

  it('uses custom model', async () => {
    const embedding = Array.from({ length: 1024 }, () => 0.1)
    mockFetch(200, { data: [{ embedding }], usage: { total_tokens: 3 } })

    const provider = createVoyageEmbeddingProvider({ apiKey: 'key', model: 'voyage-3' })
    await provider.embed('test')

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    const reqBody = JSON.parse(fetchCall[1].body as string) as { model: string }
    expect(reqBody.model).toBe('voyage-3')
  })
})
