import { describe, expect, it } from 'vitest'

import {
  appendTranscriptEntry,
  renderRuntimeTranscript,
  type RuntimeTranscript,
} from './runtime-transcript.js'

describe('appendTranscriptEntry', () => {
  it('appends to empty transcript', () => {
    const transcript: RuntimeTranscript = { goal: 'test', entries: [] }
    const updated = appendTranscriptEntry(transcript, {
      iteration: 1,
      role: 'system',
      message: 'Starting',
    })

    expect(updated.entries).toHaveLength(1)
    expect(updated.entries[0]!.message).toBe('Starting')
  })

  it('appends to transcript with existing entries', () => {
    const transcript: RuntimeTranscript = {
      goal: 'test',
      entries: [{ iteration: 1, role: 'system', message: 'First' }],
    }

    const updated = appendTranscriptEntry(transcript, {
      iteration: 2,
      role: 'tool',
      message: 'Second',
    })

    expect(updated.entries).toHaveLength(2)
    expect(updated.entries[1]!.role).toBe('tool')
  })

  it('preserves the goal', () => {
    const transcript: RuntimeTranscript = { goal: 'my goal', entries: [] }
    const updated = appendTranscriptEntry(transcript, {
      iteration: 1,
      role: 'result',
      message: 'done',
    })

    expect(updated.goal).toBe('my goal')
  })

  it('does not mutate original transcript', () => {
    const transcript: RuntimeTranscript = { goal: 'test', entries: [] }
    appendTranscriptEntry(transcript, { iteration: 1, role: 'system', message: 'X' })

    expect(transcript.entries).toHaveLength(0)
  })
})

describe('renderRuntimeTranscript', () => {
  it('renders empty transcript', () => {
    const output = renderRuntimeTranscript({ goal: 'my goal', entries: [] })

    expect(output).toContain('Runtime transcript')
    expect(output).toContain('Goal: my goal')
  })

  it('renders multiple entries', () => {
    const output = renderRuntimeTranscript({
      goal: 'analyze',
      entries: [
        { iteration: 1, role: 'system', message: 'Planning' },
        { iteration: 2, role: 'tool', message: 'Reading files' },
        { iteration: 3, role: 'result', message: 'Complete' },
      ],
    })

    expect(output).toContain('[1] SYSTEM: Planning')
    expect(output).toContain('[2] TOOL: Reading files')
    expect(output).toContain('[3] RESULT: Complete')
  })
})
