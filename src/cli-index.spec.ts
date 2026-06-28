import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  loadVectorStore,
  resolveVectorStorePath,
  runIndexCommand,
  saveVectorStore,
} from './cli-index.js'
import { VectorStore } from './memory/vector-store.js'

const TEST_DIR = join(process.cwd(), '.test-cli-index')

describe('resolveVectorStorePath', () => {
  it('resolves to .codemind/memory/vector-store.json', () => {
    const path = resolveVectorStorePath('/project')
    expect(path).toBe(join('/project', '.codemind', 'memory', 'vector-store.json'))
  })
})

describe('saveVectorStore and loadVectorStore', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it('saves and loads a vector store', () => {
    const store = new VectorStore({ dimensions: 3 })
    store.add({
      id: 'test#0',
      filePath: 'test.ts',
      chunk: 'hello world',
      embedding: [1, 0, 0],
      metadata: { lineStart: 1, lineEnd: 3 },
    })

    saveVectorStore(TEST_DIR, store)

    const loaded = loadVectorStore(TEST_DIR)
    expect(loaded).toBeDefined()
    expect(loaded!.size()).toBe(1)
    expect(loaded!.get('test#0')!.chunk).toBe('hello world')
  })

  it('loadVectorStore returns undefined when no store exists', () => {
    const loaded = loadVectorStore(TEST_DIR)
    expect(loaded).toBeUndefined()
  })

  it('loadVectorStore returns undefined for malformed JSON', () => {
    const storePath = resolveVectorStorePath(TEST_DIR)
    mkdirSync(join(TEST_DIR, '.codemind', 'memory'), { recursive: true })
    writeFileSync(storePath, 'not json', 'utf-8')

    const loaded = loadVectorStore(TEST_DIR)
    expect(loaded).toBeUndefined()
  })

  it('loadVectorStore returns undefined for missing dimensions', () => {
    const storePath = resolveVectorStorePath(TEST_DIR)
    mkdirSync(join(TEST_DIR, '.codemind', 'memory'), { recursive: true })
    writeFileSync(storePath, JSON.stringify({ entries: [] }), 'utf-8')

    const loaded = loadVectorStore(TEST_DIR)
    expect(loaded).toBeUndefined()
  })
})

describe('runIndexCommand', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'src', 'app.ts'), 'export function main() { return 42; }\n')
    writeFileSync(
      join(TEST_DIR, 'src', 'util.ts'),
      'export function add(a: number, b: number) { return a + b; }\n',
    )
    writeFileSync(join(TEST_DIR, 'README.md'), '# Test\n\nA test project.\n')
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it('indexes repository and returns summary', async () => {
    const output = await runIndexCommand([TEST_DIR])

    expect(output).toContain('CodeMind Index')
    expect(output).toContain(TEST_DIR)
    expect(output).toContain('Files scanned:')
    expect(output).toContain('Chunks indexed:')
    expect(output).toContain('Vector store entries:')
  })

  it('persists vector store to disk', async () => {
    await runIndexCommand([TEST_DIR])

    const storePath = resolveVectorStorePath(TEST_DIR)
    expect(existsSync(storePath)).toBe(true)

    const loaded = loadVectorStore(TEST_DIR)
    expect(loaded).toBeDefined()
    expect(loaded!.size()).toBeGreaterThan(0)
  })

  it('indexed store supports search', async () => {
    await runIndexCommand([TEST_DIR])

    const store = loadVectorStore(TEST_DIR)!
    const results = store.search(
      store.get(
        store
          .listFilePaths()
          .map((p) => `${p}#0`)
          .find((id) => store.get(id) !== undefined)!,
      )!.embedding,
      3,
    )
    expect(results.length).toBeGreaterThan(0)
  })
})
