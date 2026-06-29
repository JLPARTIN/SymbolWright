import { describe, expect, it } from 'vitest'

import { buildUnifiedSystemPrompt } from './unified-system-prompt.js'

describe('buildUnifiedSystemPrompt runtime modes', () => {
  it('treats APPROVED_EXECUTION as direct implementation mode', () => {
    const prompt = buildUnifiedSystemPrompt({ permissionMode: 'APPROVED_EXECUTION' })

    expect(prompt).toContain('APPROVED_EXECUTION mode')
    expect(prompt).toContain('perform direct implementation work')
    expect(prompt).toContain('Direct file edits')
    expect(prompt).toContain('Prefer useful completed work over approval theater')
    expect(prompt).not.toContain('All mutations require approval')
  })

  it('keeps READ_ONLY non-mutating', () => {
    const prompt = buildUnifiedSystemPrompt({ permissionMode: 'READ_ONLY' })

    expect(prompt).toContain('Read, inspect, search, and analyze')
    expect(prompt).toContain('without mutating files or services')
    expect(prompt).toContain('Do not run shell')
  })

  it('keeps PROPOSAL_ONLY as proposal-only', () => {
    const prompt = buildUnifiedSystemPrompt({ permissionMode: 'PROPOSAL_ONLY' })

    expect(prompt).toContain('Draft patches')
    expect(prompt).toContain('without applying changes')
  })
})
