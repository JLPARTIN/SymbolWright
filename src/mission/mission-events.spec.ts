import { describe, expect, it } from 'vitest'

import {
  createMissionEvent,
  eventMatchesFilter,
  paginateMissionEvents,
  recoverInterruptedMissionEvents,
} from './mission-events.js'

const MISSION_ID = 'mission_11111111-1111-4111-8111-111111111111'

describe('mission events', () => {
  it('creates unique ordered redacted events', () => {
    const first = createMissionEvent({
      missionId: MISSION_ID,
      type: 'agent.tool.started',
      timestamp: '2026-07-20T00:00:00.000Z',
      summary: 'tool started',
      payload: { Authorization: 'Bearer abcdefghijklmnop', operationId: 'tool-1' },
    })
    const second = createMissionEvent({
      missionId: MISSION_ID,
      type: 'agent.tool.completed',
      timestamp: '2026-07-20T00:00:01.000Z',
      summary: 'tool completed',
      payload: { operationId: 'tool-1', output: 'ok' },
    })

    expect(first.eventId).not.toBe(second.eventId)
    expect(JSON.stringify(first)).not.toContain('abcdefghijklmnop')
    expect(paginateMissionEvents([second, first], { limit: 10 }).events).toEqual([second, first])
  })

  it('caps payloads and summaries', () => {
    const event = createMissionEvent({
      missionId: MISSION_ID,
      type: 'validation.completed',
      summary: 'x'.repeat(1_000),
      payload: { output: 'y'.repeat(30_000) },
    })
    expect(event.summary).toHaveLength(500)
    expect(JSON.stringify(event.payload).length).toBeLessThan(20_000)
  })

  it('filters and paginates timelines', () => {
    const events = [
      createMissionEvent({ missionId: MISSION_ID, type: 'agent.message.user', summary: 'a' }),
      createMissionEvent({ missionId: MISSION_ID, type: 'workspace.file.saved', summary: 'b' }),
      createMissionEvent({ missionId: MISSION_ID, type: 'validation.completed', summary: 'c' }),
    ]
    expect(eventMatchesFilter(events[1]!, 'files')).toBe(true)
    expect(paginateMissionEvents(events, { filter: 'agent', limit: 1 }).total).toBe(1)
  })

  it('recovers started operations without terminal events as interrupted', () => {
    const started = createMissionEvent({
      missionId: MISSION_ID,
      type: 'validation.started',
      summary: 'Tests started',
      payload: { operationId: 'validation-1' },
    })
    const recovered = recoverInterruptedMissionEvents(MISSION_ID, [started])
    expect(recovered).toHaveLength(1)
    expect(recovered[0]?.type).toBe('validation.interrupted')
    expect(recovered[0]?.payload?.['operationId']).toBe('validation-1')
  })

  it('does not recover completed operations', () => {
    const started = createMissionEvent({
      missionId: MISSION_ID,
      type: 'agent.tool.started',
      summary: 'Tool started',
      payload: { operationId: 'tool-1' },
    })
    const completed = createMissionEvent({
      missionId: MISSION_ID,
      type: 'agent.tool.completed',
      summary: 'Tool completed',
      payload: { operationId: 'tool-1' },
    })
    expect(recoverInterruptedMissionEvents(MISSION_ID, [started, completed])).toEqual([])
  })
})
