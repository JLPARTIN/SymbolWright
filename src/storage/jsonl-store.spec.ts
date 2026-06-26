import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { JsonlStore } from './jsonl-store.js'

const TEST_DIR = join(process.cwd(), '.test-jsonl-store')
const TEST_FILE = join(TEST_DIR, 'test.jsonl')

interface TestRecord {
  readonly id: string
  readonly value: number
}

describe('JsonlStore', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('creates directory if missing', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    store.append({ id: 'a', value: 1 })

    expect(existsSync(TEST_DIR)).toBe(true)
  })

  it('appends and reads records', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    store.append({ id: 'a', value: 1 })
    store.append({ id: 'b', value: 2 })

    const records = store.readAll()
    expect(records).toHaveLength(2)
    expect(records[0]!.id).toBe('a')
    expect(records[1]!.id).toBe('b')
  })

  it('appendAll writes multiple records', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    store.appendAll([
      { id: 'x', value: 10 },
      { id: 'y', value: 20 },
    ])

    expect(store.readAll()).toHaveLength(2)
  })

  it('readAll returns empty for non-existent file', () => {
    const store = new JsonlStore<TestRecord>({
      filePath: join(TEST_DIR, 'missing.jsonl'),
      createIfMissing: false,
    })
    expect(store.readAll()).toHaveLength(0)
  })

  it('readFiltered returns matching records', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    store.appendAll([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ])

    const filtered = store.readFiltered((r) => r.value > 1)
    expect(filtered).toHaveLength(2)
  })

  it('count returns number of records', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    expect(store.count()).toBe(0)

    store.appendAll([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ])
    expect(store.count()).toBe(2)
  })

  it('clear removes all records', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    store.appendAll([{ id: 'a', value: 1 }])
    expect(store.count()).toBe(1)

    store.clear()
    expect(store.count()).toBe(0)
  })

  it('exists returns correct state', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE, createIfMissing: false })
    expect(store.exists()).toBe(false)

    mkdirSync(TEST_DIR, { recursive: true })
    store.append({ id: 'a', value: 1 })
    expect(store.exists()).toBe(true)
  })

  it('getFilePath returns the file path', () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    expect(store.getFilePath()).toBe(TEST_FILE)
  })

  it('skips malformed lines', async () => {
    const store = new JsonlStore<TestRecord>({ filePath: TEST_FILE })
    store.append({ id: 'a', value: 1 })

    const { appendFileSync } = await import('node:fs')
    appendFileSync(TEST_FILE, 'not-json\n', 'utf-8')

    store.append({ id: 'b', value: 2 })

    const records = store.readAll()
    expect(records).toHaveLength(2)
  })
})
