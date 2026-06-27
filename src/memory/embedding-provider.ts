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

export interface ApiEmbeddingProviderConfig {
  readonly apiKey: string
  readonly model?: string
  readonly baseUrl?: string
  readonly dimensions?: number
  readonly batchSize?: number
}

const VOYAGE_API_BASE = 'https://api.voyageai.com/v1'
const DEFAULT_VOYAGE_MODEL = 'voyage-code-3'
const DEFAULT_VOYAGE_DIMENSIONS = 1024
const DEFAULT_BATCH_SIZE = 8

export function createVoyageEmbeddingProvider(config: ApiEmbeddingProviderConfig): EmbeddingProvider {
  const baseUrl = config.baseUrl ?? VOYAGE_API_BASE
  const model = config.model ?? DEFAULT_VOYAGE_MODEL
  const dimensions = config.dimensions ?? DEFAULT_VOYAGE_DIMENSIONS
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE

  async function callApi(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        input_type: 'document',
      }),
    })

    if (response.status !== 200) {
      const body = await response.text()
      throw new Error(`Embedding API returned ${response.status}: ${body}`)
    }

    const json = (await response.json()) as VoyageApiResponse
    if (!Array.isArray(json.data)) {
      throw new Error('Embedding API response missing data array')
    }

    return json.data.map((item, i) => ({
      embedding: item.embedding,
      tokenCount: json.usage?.total_tokens
        ? Math.ceil(json.usage.total_tokens / texts.length)
        : Math.ceil((texts[i]?.length ?? 0) / 4),
    }))
  }

  return {
    providerId: 'voyage',
    dimensions,

    async embed(text: string): Promise<EmbeddingResult> {
      const results = await callApi([text])
      return results[0]!
    },

    async embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
      const results: EmbeddingResult[] = []
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)
        const batchResults = await callApi(batch)
        results.push(...batchResults)
      }
      return results
    },
  }
}

interface VoyageApiResponse {
  readonly data: readonly { readonly embedding: readonly number[] }[]
  readonly usage?: { readonly total_tokens: number }
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
