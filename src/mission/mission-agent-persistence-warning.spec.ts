import { describe, expect, it, vi } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission persistence failure boundary', () => {
  it('exposes storage failures as ordinary errors that callers can convert to warnings', () => {
    const service = new MissionService({ workspaceRoot: '/tmp' })
    vi.spyOn(service.getStore(), 'writeMission').mockImplementation(() => {
      throw new Error('disk unavailable')
    })
    expect(() => service.recordAgentResult(
      'mission_11111111-1111-4111-8111-111111111111',
      [],
      'answer remains available to the active response',
      'completed',
    )).toThrow()
  })
})
