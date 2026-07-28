import { describe, expect, it } from 'vitest'

import { withAcquisitionRootLock } from './acquisition-root-lock.js'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('withAcquisitionRootLock', () => {
  it('runs calls for the same root strictly one at a time, in order', async () => {
    const order: string[] = []
    const first = deferred<void>()

    const call1 = withAcquisitionRootLock('/tmp/same-root', async () => {
      order.push('call1-start')
      await first.promise
      order.push('call1-end')
    })
    const call2 = withAcquisitionRootLock('/tmp/same-root', async () => {
      order.push('call2-start')
      order.push('call2-end')
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual(['call1-start'])

    first.resolve()
    await Promise.all([call1, call2])

    expect(order).toEqual(['call1-start', 'call1-end', 'call2-start', 'call2-end'])
  })

  it('does not let a rejection from one call block the next one queued for the same root', async () => {
    const order: string[] = []

    const call1 = withAcquisitionRootLock('/tmp/same-root-2', async () => {
      order.push('call1')
      throw new Error('boom')
    })
    const call2 = withAcquisitionRootLock('/tmp/same-root-2', async () => {
      order.push('call2')
    })

    await expect(call1).rejects.toThrow('boom')
    await expect(call2).resolves.toBeUndefined()
    expect(order).toEqual(['call1', 'call2'])
  })

  it('normalizes root paths so relative and absolute forms of the same directory still serialize', async () => {
    const order: string[] = []
    const first = deferred<void>()

    const call1 = withAcquisitionRootLock('/tmp/normalize-me/../normalize-me', async () => {
      order.push('call1-start')
      await first.promise
      order.push('call1-end')
    })
    const call2 = withAcquisitionRootLock('/tmp/normalize-me', async () => {
      order.push('call2')
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(order).toEqual(['call1-start'])
    first.resolve()
    await Promise.all([call1, call2])
    expect(order).toEqual(['call1-start', 'call1-end', 'call2'])
  })

  it('does not serialize calls for different roots against each other', async () => {
    const order: string[] = []
    const blockCall1 = deferred<void>()

    const call1 = withAcquisitionRootLock('/tmp/root-a', async () => {
      order.push('call1-start')
      await blockCall1.promise
      order.push('call1-end')
    })
    const call2 = withAcquisitionRootLock('/tmp/root-b', async () => {
      order.push('call2')
    })

    await call2
    expect(order).toEqual(['call1-start', 'call2'])
    blockCall1.resolve()
    await call1
  })
})
