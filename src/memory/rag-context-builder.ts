import type { VectorStore, VectorSearchResult } from './vector-store.js'
import type { EmbeddingProvider } from './embedding-provider.js'

export interface RagContextConfig {
  readonly maxChunks: number
  readonly maxTokenBudget: number
  readonly minScore: number
  readonly charsPerToken: number
}

export interface RagContextResult {
  readonly contextText: string
  readonly chunksUsed: number
  readonly totalTokenEstimate: number
  readonly sources: readonly RagSource[]
}

export interface RagSource {
  readonly filePath: string
  readonly lineStart: number | undefined
  readonly lineEnd: number | undefined
  readonly score: number
}

const DEFAULT_RAG_CONFIG: RagContextConfig = {
  maxChunks: 10,
  maxTokenBudget: 4000,
  minScore: 0.1,
  charsPerToken: 4,
}

export async function buildRagContext(
  query: string,
  vectorStore: VectorStore,
  embeddingProvider: EmbeddingProvider,
  config: RagContextConfig = DEFAULT_RAG_CONFIG,
): Promise<RagContextResult> {
  if (vectorStore.size() === 0) {
    return { contextText: '', chunksUsed: 0, totalTokenEstimate: 0, sources: [] }
  }

  const queryResult = await embeddingProvider.embed(query)
  const searchResults = vectorStore.search(queryResult.embedding, config.maxChunks * 2)

  const filtered = searchResults.filter((r) => r.score >= config.minScore)
  const selected = selectWithinBudget(filtered, config)

  if (selected.length === 0) {
    return { contextText: '', chunksUsed: 0, totalTokenEstimate: 0, sources: [] }
  }

  const sections: string[] = ['## Relevant Code Context', '']

  const sources: RagSource[] = []

  for (const result of selected) {
    const { entry, score } = result
    const locationInfo = entry.metadata.lineStart !== undefined
      ? ` (lines ${entry.metadata.lineStart}-${entry.metadata.lineEnd ?? '?'})`
      : ''

    sections.push(`### ${entry.filePath}${locationInfo}`)
    sections.push('```')
    sections.push(entry.chunk)
    sections.push('```')
    sections.push('')

    sources.push({
      filePath: entry.filePath,
      lineStart: entry.metadata.lineStart,
      lineEnd: entry.metadata.lineEnd,
      score,
    })
  }

  const contextText = sections.join('\n')
  const totalTokenEstimate = Math.ceil(contextText.length / config.charsPerToken)

  return {
    contextText,
    chunksUsed: selected.length,
    totalTokenEstimate,
    sources,
  }
}

function selectWithinBudget(
  results: readonly VectorSearchResult[],
  config: RagContextConfig,
): readonly VectorSearchResult[] {
  const selected: VectorSearchResult[] = []
  let tokenBudget = config.maxTokenBudget

  for (const result of results) {
    if (selected.length >= config.maxChunks) break

    const chunkTokens = Math.ceil(result.entry.chunk.length / config.charsPerToken)
    if (chunkTokens > tokenBudget) continue

    selected.push(result)
    tokenBudget -= chunkTokens
  }

  return selected
}
