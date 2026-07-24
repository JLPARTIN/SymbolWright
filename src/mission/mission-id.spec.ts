import { describe, expect, it } from 'vitest'

import { assertValidMissionId, generateMissionId, isValidMissionId } from './mission-id.js'

describe('mission ids', () => {
  it('generates real unique UUID-backed ids', () => {
    const first = generateMissionId()
    const second = generateMissionId()
    expect(first).not.toBe(second)
    expect(isValidMissionId(first)).toBe(true)
    expect(isValidMissionId(second)).toBe(true)
    expect(() => assertValidMissionId(first)).not.toThrow()
  })

  it('rejects traversal and arbitrary ids', () => {
    expect(isValidMissionId('../../etc')).toBe(false)
    expect(isValidMissionId('mission_test')).toBe(false)
    expect(() => assertValidMissionId('mission_test')).toThrow('Invalid mission id: mission_test')
  })
})
