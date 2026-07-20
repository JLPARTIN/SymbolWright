import { describe, expect, it } from 'vitest'

import { generateMissionId, isValidMissionId } from './mission-id.js'

describe('mission ids', () => {
  it('generates real unique UUID-backed ids', () => {
    const first = generateMissionId()
    const second = generateMissionId()
    expect(first).not.toBe(second)
    expect(isValidMissionId(first)).toBe(true)
    expect(isValidMissionId(second)).toBe(true)
  })

  it('rejects traversal and arbitrary ids', () => {
    expect(isValidMissionId('../../etc')).toBe(false)
    expect(isValidMissionId('mission_test')).toBe(false)
  })
})
