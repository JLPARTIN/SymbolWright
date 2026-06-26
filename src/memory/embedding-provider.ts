export interface EmbeddingResult {
  readonly embedding: readonly number[]
  readonly tokenCount: number
}

export interface EmbeddingProvider {
  readonly providerId: string
  readonly dimensions: number
  embed(text: string): Promise<EmbeddingResult>
  embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]>
}

export function createHashEmbeddingProvider(dimensions: number = 256): EmbeddingProvider {
  return {
    providerId: 'hash-embedding',
    dimensions,

    async embed(text: string): Promise<EmbeddingResult> {
      const embedding = hashEmbed(text, dimensions)
      return { embedding, tokenCount: Math.ceil(text.length / 4) }
    },

    async embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
      return texts.map((text) => ({
        embedding: hashEmbed(text, dimensions),
        tokenCount: Math.ceil(text.length / 4),
      }))
    },
  }
}

function hashEmbed(text: string, dimensions: number): readonly number[] {
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

  return [...result]
}
