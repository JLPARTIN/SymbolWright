import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { ProjectMemory, resolveProjectMemoryDir } from './project-memory.js'
import type { ProjectMemoryCategory } from './project-memory.js'

const TEST_DIR = join(process.cwd(), '.test-project-memory')

describe('ProjectMemory', () => {
  let memory: ProjectMemory

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
    memory = new ProjectMemory(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  it('starts with zero entries', () => {
    expect(memory.size()).toBe(0)
  })

  it('learns a new entry', () => {
    const entry = memory.learn({
      category: 'naming_convention',
      key: 'variables',
      value: 'camelCase',
      confidence: 0.9,
      source: 'codebase scan',
    })

    expect(entry.id).toMatch(/^mem-/)
    expect(entry.learnedAt).toBeTruthy()
    expect(memory.size()).toBe(1)
  })

  it('updates existing entry with same category and key', () => {
    memory.learn({
      category: 'naming_convention',
      key: 'variables',
      value: 'camelCase',
      confidence: 0.7,
      source: 'scan 1',
    })

    memory.learn({
      category: 'naming_convention',
      key: 'variables',
      value: 'snake_case',
      confidence: 0.9,
      source: 'scan 2',
    })

    expect(memory.size()).toBe(1)
    const entries = memory.query({ category: 'naming_convention' })
    expect(entries[0]!.value).toBe('snake_case')
    expect(entries[0]!.confidence).toBe(0.9)
  })

  it('stores different category+key as separate entries', () => {
    memory.learn({
      category: 'naming_convention',
      key: 'variables',
      value: 'camelCase',
      confidence: 0.9,
      source: 'test',
    })

    memory.learn({
      category: 'test_pattern',
      key: 'framework',
      value: 'vitest',
      confidence: 0.95,
      source: 'test',
    })

    expect(memory.size()).toBe(2)
  })

  it('queries all entries by default', () => {
    learnSamples(memory)
    const all = memory.query()
    expect(all.length).toBe(3)
  })

  it('queries by category', () => {
    learnSamples(memory)
    const entries = memory.query({ category: 'naming_convention' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.category).toBe('naming_convention')
  })

  it('queries with minConfidence', () => {
    learnSamples(memory)
    const entries = memory.query({ minConfidence: 0.9 })
    expect(entries.length).toBe(2)
    for (const e of entries) {
      expect(e.confidence).toBeGreaterThanOrEqual(0.9)
    }
  })

  it('queries with limit', () => {
    learnSamples(memory)
    const entries = memory.query({ limit: 2 })
    expect(entries.length).toBe(2)
  })

  it('sorts results by confidence descending', () => {
    learnSamples(memory)
    const entries = memory.query()
    for (let i = 0; i < entries.length - 1; i++) {
      expect(entries[i]!.confidence).toBeGreaterThanOrEqual(entries[i + 1]!.confidence)
    }
  })

  it('recall is shorthand for query by category', () => {
    learnSamples(memory)
    const entries = memory.recall('test_pattern')
    expect(entries.length).toBe(1)
    expect(entries[0]!.category).toBe('test_pattern')
  })

  it('forgets an entry by id', () => {
    const entry = memory.learn({
      category: 'naming_convention',
      key: 'vars',
      value: 'camelCase',
      confidence: 0.9,
      source: 'test',
    })

    expect(memory.forget(entry.id)).toBe(true)
    expect(memory.size()).toBe(0)
  })

  it('forget returns false for unknown id', () => {
    expect(memory.forget('nonexistent')).toBe(false)
  })

  it('summarize returns correct counts', () => {
    learnSamples(memory)
    const summary = memory.summarize()

    expect(summary.totalEntries).toBe(3)
    expect(summary.byCategory['naming_convention']).toBe(1)
    expect(summary.byCategory['test_pattern']).toBe(1)
    expect(summary.byCategory['error_pattern']).toBe(1)
    expect(summary.oldestEntry).toBeTruthy()
    expect(summary.newestEntry).toBeTruthy()
  })

  it('summarize handles empty memory', () => {
    const summary = memory.summarize()
    expect(summary.totalEntries).toBe(0)
    expect(summary.oldestEntry).toBeUndefined()
    expect(summary.newestEntry).toBeUndefined()
  })

  it('buildContextSection returns empty for no entries', () => {
    expect(memory.buildContextSection()).toBe('')
  })

  it('buildContextSection returns markdown for entries', () => {
    learnSamples(memory)
    const section = memory.buildContextSection()

    expect(section).toContain('## Project Memory')
    expect(section).toContain('Naming Convention')
    expect(section).toContain('camelCase')
  })

  it('buildContextSection only includes high-confidence entries', () => {
    memory.learn({
      category: 'naming_convention',
      key: 'vars',
      value: 'low confidence',
      confidence: 0.1,
      source: 'test',
    })

    expect(memory.buildContextSection()).toBe('')
  })
})

describe('resolveProjectMemoryDir', () => {
  it('resolves to .codemind/memory under workspace', () => {
    const dir = resolveProjectMemoryDir('/home/user/project')
    expect(dir).toBe(join('/home/user/project', '.codemind', 'memory'))
  })
})

function learnSamples(memory: ProjectMemory): void {
  memory.learn({
    category: 'naming_convention' as ProjectMemoryCategory,
    key: 'variables',
    value: 'camelCase',
    confidence: 0.8,
    source: 'scan',
  })

  memory.learn({
    category: 'test_pattern' as ProjectMemoryCategory,
    key: 'framework',
    value: 'vitest',
    confidence: 0.95,
    source: 'scan',
  })

  memory.learn({
    category: 'error_pattern' as ProjectMemoryCategory,
    key: 'null-checks',
    value: 'use optional chaining',
    confidence: 0.9,
    source: 'scan',
  })
}
