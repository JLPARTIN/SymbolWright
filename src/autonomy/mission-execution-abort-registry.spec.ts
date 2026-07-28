import { describe, expect, it } from 'vitest'

import { abortReasonOf, MissionExecutionAbortRegistry } from './mission-execution-abort-registry.js'

describe('MissionExecutionAbortRegistry', () => {
  it('registers, aborts, and releases a mission execution', () => {
    const registry = new MissionExecutionAbortRegistry()
    const registered = registry.registerIfAbsent('m1')
    expect(registered.ok).toBe(true)
    if (!registered.ok) throw new Error('unreachable')

    expect(registered.signal.aborted).toBe(false)
    expect(registry.requestAbort('m1', 'operator')).toBe(true)
    expect(registered.signal.aborted).toBe(true)
    expect(abortReasonOf(registered.signal)).toBe('operator')

    registry.release('m1')
    expect(registry.isRegistered('m1')).toBe(false)
  })

  it('rejects a second registration for an already-running mission', () => {
    const registry = new MissionExecutionAbortRegistry()
    expect(registry.registerIfAbsent('m1').ok).toBe(true)
    expect(registry.registerIfAbsent('m1').ok).toBe(false)
  })

  it('allows re-registration after release', () => {
    const registry = new MissionExecutionAbortRegistry()
    registry.registerIfAbsent('m1')
    registry.release('m1')
    expect(registry.registerIfAbsent('m1').ok).toBe(true)
  })

  it('requestAbort on an unregistered mission returns false without throwing', () => {
    const registry = new MissionExecutionAbortRegistry()
    expect(registry.requestAbort('does-not-exist', 'shutdown')).toBe(false)
  })

  it('abortReasonOf returns undefined for a signal that was never aborted', () => {
    const controller = new AbortController()
    expect(abortReasonOf(controller.signal)).toBeUndefined()
  })

  it('abortReasonOf falls back to "system" for an unrecognized reason value', () => {
    const controller = new AbortController()
    controller.abort('something-unexpected')
    expect(abortReasonOf(controller.signal)).toBe('system')
  })
})
