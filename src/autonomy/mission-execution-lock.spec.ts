import { describe, expect, it } from 'vitest'

import { MissionExecutionLock } from './mission-execution-lock.js'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('MissionExecutionLock', () => {
  it('serializes calls for the same key', async () => {
    const lock = new MissionExecutionLock()
    const order: number[] = []
    const first = deferred<void>()

    const callA = lock.withLock('m1', async () => {
      order.push(1)
      await first.promise
      order.push(2)
    })
    const callB = lock.withLock('m1', async () => {
      order.push(3)
    })

    // callB must not run until callA's fn has fully settled.
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual([1])
    first.resolve()
    await Promise.all([callA, callB])
    expect(order).toEqual([1, 2, 3])
  })

  it('runs calls for different keys concurrently', async () => {
    const lock = new MissionExecutionLock()
    const order: string[] = []
    const blockA = deferred<void>()

    const callA = lock.withLock('m1', async () => {
      order.push('a-start')
      await blockA.promise
      order.push('a-end')
    })
    const callB = lock.withLock('m2', async () => {
      order.push('b-start')
      order.push('b-end')
    })

    await callB
    expect(order).toEqual(['a-start', 'b-start', 'b-end'])
    blockA.resolve()
    await callA
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end'])
  })

  it('a rejection from one call does not block the next queued call', async () => {
    const lock = new MissionExecutionLock()
    const failing = lock.withLock('m1', async () => {
      throw new Error('boom')
    })
    await expect(failing).rejects.toThrow('boom')

    const next = await lock.withLock('m1', async () => 'ok')
    expect(next).toBe('ok')
  })
})
