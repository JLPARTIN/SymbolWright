import { describe, expect, it } from 'vitest'

import { compactTranscript } from './transcript-compactor.js'
import type { RuntimeTranscript } from '../transcript/runtime-transcript.js'

function makeTranscript(entryCount: number): RuntimeTranscript {
  return {
    goal: 'test goal',
    entries: Array.from({ length: entryCount }, (_, i) => ({
      iteration: i + 1,
      role: 'tool' as const,
      message: `entry ${i + 1}`,
    })),
  }
}

describe('compactTranscript', () => {
  it('preserves the goal', () => {
    const result = compactTranscript(makeTranscript(3))

    expect(result.goal).toBe('test goal')
  })

  it('counts all entries', () => {
    const result = compactTranscript(makeTranscript(10))

    expect(result.entryCount).toBe(10)
  })

  it('summarizes the last 5 entries', () => {
    const result = compactTranscript(makeTranscript(10))

    expect(result.summary).toHaveLength(5)
    expect(result.summary[0]).toContain('entry 6')
    expect(result.summary[4]).toContain('entry 10')
  })

  it('includes all entries when fewer than 5', () => {
    const result = compactTranscript(makeTranscript(3))

    expect(result.summary).toHaveLength(3)
    expect(result.summary[0]).toContain('entry 1')
    expect(result.summary[2]).toContain('entry 3')
  })

  it('handles empty transcript', () => {
    const result = compactTranscript({ goal: 'empty', entries: [] })

    expect(result.entryCount).toBe(0)
    expect(result.summary).toHaveLength(0)
  })

  it('formats summary as "role: message"', () => {
    const transcript: RuntimeTranscript = {
      goal: 'test',
      entries: [{ iteration: 1, role: 'system', message: 'hello world' }],
    }
    const result = compactTranscript(transcript)

    expect(result.summary[0]).toBe('system: hello world')
  })
})
