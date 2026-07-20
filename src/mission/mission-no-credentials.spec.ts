import { describe, expect, it } from 'vitest'

import type { CodeMindMission } from './mission-types.js'

describe('mission credential boundary', () => {
  it('does not model provider or access credentials', () => {
    const agentKeys: Array<keyof CodeMindMission['agent']> = [
      'runtimeMode',
      'activeProviderId',
      'model',
      'messages',
      'pendingDraft',
    ]
    expect(agentKeys).not.toContain('apiKey')
    expect(agentKeys).not.toContain('authorization')
  })
})
