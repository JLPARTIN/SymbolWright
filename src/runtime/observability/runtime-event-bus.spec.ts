import { describe, expect, it } from 'vitest'

import { createRuntimeEventBus, type RuntimeEvent } from './runtime-event-bus.js'

function makeEvent(category: RuntimeEvent['category'], action: string): RuntimeEvent {
  return {
    category,
    action,
    timestamp: new Date().toISOString(),
    detail: `${action} detail`,
  }
}

describe('RuntimeEventBus', () => {
  it('emits events to subscribers', () => {
    const bus = createRuntimeEventBus()
    const received: RuntimeEvent[] = []

    bus.subscribe('tool_execution', (e) => received.push(e))
    bus.emit(makeEvent('tool_execution', 'read_file'))

    expect(received).toHaveLength(1)
    expect(received[0]!.action).toBe('read_file')
  })

  it('filters events by category', () => {
    const bus = createRuntimeEventBus()
    const toolEvents: RuntimeEvent[] = []
    const policyEvents: RuntimeEvent[] = []

    bus.subscribe('tool_execution', (e) => toolEvents.push(e))
    bus.subscribe('policy_check', (e) => policyEvents.push(e))

    bus.emit(makeEvent('tool_execution', 'read'))
    bus.emit(makeEvent('policy_check', 'check'))
    bus.emit(makeEvent('tool_execution', 'write'))

    expect(toolEvents).toHaveLength(2)
    expect(policyEvents).toHaveLength(1)
  })

  it('unsubscribes correctly', () => {
    const bus = createRuntimeEventBus()
    const received: RuntimeEvent[] = []
    const callback = (e: RuntimeEvent): void => {
      received.push(e)
    }

    bus.subscribe('audit_record', callback)
    bus.emit(makeEvent('audit_record', 'first'))

    bus.unsubscribe('audit_record', callback)
    bus.emit(makeEvent('audit_record', 'second'))

    expect(received).toHaveLength(1)
    expect(received[0]!.action).toBe('first')
  })

  it('getEvents returns all events when no category specified', () => {
    const bus = createRuntimeEventBus()

    bus.emit(makeEvent('tool_execution', 'a'))
    bus.emit(makeEvent('policy_check', 'b'))
    bus.emit(makeEvent('session_lifecycle', 'c'))

    expect(bus.getEvents()).toHaveLength(3)
  })

  it('getEvents filters by category', () => {
    const bus = createRuntimeEventBus()

    bus.emit(makeEvent('tool_execution', 'a'))
    bus.emit(makeEvent('policy_check', 'b'))
    bus.emit(makeEvent('tool_execution', 'c'))

    const filtered = bus.getEvents('tool_execution')
    expect(filtered).toHaveLength(2)
    expect(filtered.every((e) => e.category === 'tool_execution')).toBe(true)
  })

  it('clear empties event store', () => {
    const bus = createRuntimeEventBus()

    bus.emit(makeEvent('health_check', 'a'))
    bus.emit(makeEvent('health_check', 'b'))
    expect(bus.getEvents()).toHaveLength(2)

    bus.clear()
    expect(bus.getEvents()).toHaveLength(0)
  })

  it('getEvents returns a copy', () => {
    const bus = createRuntimeEventBus()
    bus.emit(makeEvent('approval_gate', 'test'))

    const events1 = bus.getEvents()
    const events2 = bus.getEvents()
    expect(events1).not.toBe(events2)
    expect(events1).toEqual(events2)
  })
})
