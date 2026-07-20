import { describe, expect, it } from 'vitest'

import { parseAgentRequestBody } from './codemind-agent-request.js'

describe('agent mission request parsing', () => {
  it('accepts an optional mission id', () => {
    const parsed = parseAgentRequestBody({
      providerId: 'openai', message: 'continue', missionId: 'mission_11111111-1111-4111-8111-111111111111',
    })
    expect(parsed.missionId).toBe('mission_11111111-1111-4111-8111-111111111111')
  })

  it('keeps non-mission requests unchanged', () => {
    const parsed = parseAgentRequestBody({ providerId: 'openai', message: 'ordinary' })
    expect(parsed.missionId).toBeUndefined()
    expect(parsed.mode).toBe('READ_ONLY')
  })

  it('rejects empty mission ids', () => {
    expect(() => parseAgentRequestBody({ providerId: 'openai', message: 'x', missionId: '' })).toThrow(
      'missionId',
    )
  })
})
