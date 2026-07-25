import { describe, expect, it } from 'vitest'

import type { SymbolWrightMission } from './mission-types.js'

describe('mission subsystem boundaries', () => {
  it('stores checkpoint and memory references instead of duplicate stores', () => {
    const references: SymbolWrightMission['references'] = {
      checkpointIds: ['checkpoint-1'],
      checkpointLinks: [],
      memoryEntryIds: ['memory-1'],
      memoryLinks: [],
      commitShas: [],
      pullRequestUrls: [],
    }
    expect(references).not.toHaveProperty('checkpointContents')
    expect(references).not.toHaveProperty('memoryDatabase')
  })
})
