import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveCodemindConfig } from './config/codemind-config.js'
import { createHashEmbeddingProvider, createVoyageEmbeddingProvider } from './memory/embedding-provider.js'
import type { EmbeddingProvider } from './memory/embedding-provider.js'
import { ProjectMemory, resolveProjectMemoryDir } from './memory/project-memory.js'
import { VectorStore } from './memory/vector-store.js'
import type { SerializedVectorStore } from './memory/vector-store.js'

const VECTOR_STORE_FILENAME = 'vector-store.json'

export function resolveVectorStorePath(cwd: string): string {
  return join(resolveProjectMemoryDir(cwd), VECTOR_STORE_FILENAME)
}

export function loadVectorStore(cwd: string): VectorStore | undefined {
  const storePath = resolveVectorStorePath(cwd)
  if (!existsSync(storePath)) return undefined

  try {
    const raw = readFileSync(storePath, 'utf-8')
    const data = JSON.parse(raw) as SerializedVectorStore
    if (typeof data.dimensions !== 'number' || !Array.isArray(data.entries)) return undefined
    return VectorStore.deserialize(data)
  } catch {
    return undefined
  }
}

export function saveVectorStore(cwd: string, store: VectorStore): void {
  const storePath = resolveVectorStorePath(cwd)
  const dir = resolveProjectMemoryDir(cwd)
  mkdirSync(dir, { recursive: true })
  writeFileSync(storePath, JSON.stringify(store.serialize()), 'utf-8')
}

function resolveEmbeddingProvider(): EmbeddingProvider {
  const config = resolveCodemindConfig()
  if (config.embeddingProvider === 'voyage' && config.voyageApiKey !== undefined) {
    return createVoyageEmbeddingProvider({ apiKey: config.voyageApiKey })
  }
  return createHashEmbeddingProvider()
}

export async function runIndexCommand(args: readonly string[]): Promise<string> {
  const cwd = args[0] ?? process.cwd()
  const embeddingProvider = resolveEmbeddingProvider()
  const memoryDir = resolveProjectMemoryDir(cwd)
  const memory = new ProjectMemory(memoryDir)
  const vectorStore = new VectorStore({ dimensions: embeddingProvider.dimensions })

  const result = await memory.indexRepository(cwd, embeddingProvider, vectorStore)

  saveVectorStore(cwd, vectorStore)

  const lines = [
    'CodeMind Index',
    '',
    `Workspace: ${cwd}`,
    `Provider: ${embeddingProvider.providerId}`,
    `Dimensions: ${embeddingProvider.dimensions}`,
    `Files scanned: ${result.filesScanned}`,
    `Chunks indexed: ${result.chunksIndexed}`,
    `Vector store entries: ${vectorStore.size()}`,
    `Stored at: ${resolveVectorStorePath(cwd)}`,
  ]

  return lines.join('\n')
}
