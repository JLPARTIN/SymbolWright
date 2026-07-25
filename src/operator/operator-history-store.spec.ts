import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { OperatorHistoryStore } from './operator-history-store.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('OperatorHistoryStore', () => {
  it('returns an empty list before history exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'symbolwright-history-'))
    tempDirs.push(dir)
    const store = OperatorHistoryStore.fromWorkspace(dir)

    expect(store.list()).toEqual([])
  })

  it('persists and reloads history entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'symbolwright-history-'))
    tempDirs.push(dir)
    const store = OperatorHistoryStore.fromWorkspace(dir)

    store.append({ timestamp: '2026-06-26T00:00:00.000Z', input: '/status', kind: 'slash' })
    store.append({ timestamp: '2026-06-26T00:01:00.000Z', input: 'inspect repo', kind: 'mission' })

    expect(store.list()).toEqual([
      { timestamp: '2026-06-26T00:00:00.000Z', input: '/status', kind: 'slash' },
      { timestamp: '2026-06-26T00:01:00.000Z', input: 'inspect repo', kind: 'mission' },
    ])
  })

  it('clears persisted history', () => {
    const dir = mkdtempSync(join(tmpdir(), 'symbolwright-history-'))
    tempDirs.push(dir)
    const store = OperatorHistoryStore.fromWorkspace(dir)

    store.append({ timestamp: '2026-06-26T00:00:00.000Z', input: '/status', kind: 'slash' })
    store.clear()

    expect(store.list()).toEqual([])
  })
})
