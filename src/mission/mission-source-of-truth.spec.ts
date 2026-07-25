import { describe, expect, it } from 'vitest'

import type { SymbolWrightMission } from './mission-types.js'

describe('mission repository source of truth', () => {
  it('models open files with paths and hashes rather than full content', () => {
    const openFile: SymbolWrightMission['workspace']['openFiles'][number] = {
      path: 'src/a.ts',
      openedAt: '2026-07-20T00:00:00.000Z',
      contentHash: 'abc',
      exists: true,
    }
    expect(openFile).not.toHaveProperty('content')
  })
})
