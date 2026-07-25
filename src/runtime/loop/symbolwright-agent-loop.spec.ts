import { describe, expect, it } from 'vitest'

import { compactTranscript } from '../compaction/transcript-compactor.js'
import { RuntimeSessionStore } from '../memory/session-store.js'
import { createRuntimeSession } from '../session/runtime-session.js'
import { runReadOnlyRuntimeLoop } from './symbolwright-agent-loop.js'

describe('runReadOnlyRuntimeLoop', () => {
  it('runs bounded read-only tools and captures a transcript', async () => {
    const result = await runReadOnlyRuntimeLoop({ goal: 'prepare proposal mode follow-up' })

    expect(result.status).toBe('completed')
    expect(result.iterations).toBe(3)
    expect(result.transcriptText).toContain('invoke plan_goal')
    expect(result.transcriptText).toContain('invoke validation_plan')
    expect(result.transcriptText).toContain('invoke propose_edit')
  })

  it('enforces iteration caps', async () => {
    const result = await runReadOnlyRuntimeLoop({ goal: 'cap runtime loop', maxIterations: 1 })

    expect(result.status).toBe('iteration_limit')
    expect(result.iterations).toBe(1)
    expect(result.finalMessage).toContain('iteration limit')
  })

  it('requires a goal', async () => {
    await expect(runReadOnlyRuntimeLoop({ goal: '   ' })).rejects.toThrow('Missing goal')
  })
})

describe('RuntimeSessionStore', () => {
  it('stores runtime sessions', () => {
    const store = new RuntimeSessionStore()
    const session = createRuntimeSession('store transcript')

    store.save(session)

    expect(store.get(session.id)).toEqual(session)
    expect(store.list()).toEqual([session])
  })
})

describe('compactTranscript', () => {
  it('summarizes recent transcript entries', async () => {
    const result = await runReadOnlyRuntimeLoop({ goal: 'compact transcript' })
    const compacted = compactTranscript(result.session.transcript)

    expect(compacted.goal).toBe('compact transcript')
    expect(compacted.entryCount).toBeGreaterThan(0)
    expect(compacted.summary.length).toBeLessThanOrEqual(5)
  })
})
