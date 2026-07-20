import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionStore } from './mission-store.js'

describe('mission local-only storage', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('resolves the store only under the active workspace .codemind directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-local-only-'))
    roots.push(root)
    const store = new MissionStore({ workspaceRoot: root })
    expect(store.getRootPath()).toBe(join(root, '.codemind', 'missions'))
  })
})
