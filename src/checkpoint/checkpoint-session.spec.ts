import { describe, expect, it } from 'vitest'

import {
  generateCheckpointId,
  generateCheckpointSessionId,
  resolveCheckpointSessionId,
} from './checkpoint-session.js'

describe('generateCheckpointSessionId', () => {
  it('produces a real, non-placeholder id', () => {
    const id = generateCheckpointSessionId()
    expect(id).toMatch(/^cm-\d+-[0-9a-f]{8}$/)
  })

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateCheckpointSessionId()))
    expect(ids.size).toBe(20)
  })
})

describe('resolveCheckpointSessionId', () => {
  it('prefers a caller-supplied session id', () => {
    expect(resolveCheckpointSessionId('cm-explicit')).toBe('cm-explicit')
  })

  it('mints a real session id when none is supplied', () => {
    expect(resolveCheckpointSessionId(undefined)).toMatch(/^cm-\d+-[0-9a-f]{8}$/)
  })
})

describe('generateCheckpointId', () => {
  it('produces a real, non-placeholder id', () => {
    const id = generateCheckpointId()
    expect(id).toMatch(/^ckpt-\d+-[0-9a-f]{8}$/)
  })

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateCheckpointId()))
    expect(ids.size).toBe(20)
  })
})
