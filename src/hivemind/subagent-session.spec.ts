import { describe, expect, it } from 'vitest'

import { generateSubagentSessionId } from './subagent-session.js'

describe('generateSubagentSessionId', () => {
  it('produces a real, non-placeholder id distinct from the checkpoint session prefix', () => {
    const id = generateSubagentSessionId()
    expect(id).toMatch(/^sub-\d+-[0-9a-f]{8}$/)
  })

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSubagentSessionId()))
    expect(ids.size).toBe(20)
  })
})
