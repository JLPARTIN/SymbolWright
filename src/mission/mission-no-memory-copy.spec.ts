import { describe, expect, it } from 'vitest'

import type { MissionMemoryReference } from './mission-types.js'

describe('mission memory boundary', () => {
  it('contains stable memory id action and summary only', () => {
    const reference: MissionMemoryReference = {
      memoryEntryId: 'mem-1', kind: 'episodic', action: 'recalled',
      timestamp: '2026-07-20T00:00:00.000Z', summary: 'Relevant memory recalled',
    }
    expect(reference).not.toHaveProperty('content')
    expect(reference).not.toHaveProperty('database')
  })
})
