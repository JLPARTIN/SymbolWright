import { describe, expect, it } from 'vitest'

import type { PersistedAgentDraft } from './mission-types.js'

describe('mission pending drafts', () => {
  it('stores reviewable draft metadata without send state', () => {
    const draft: PersistedAgentDraft = {
      text: 'Review before sending', source: 'workspace', createdAt: '2026-07-20T00:00:00.000Z',
    }
    expect(draft.text).toContain('Review')
    expect(draft).not.toHaveProperty('autoSend')
  })
})
