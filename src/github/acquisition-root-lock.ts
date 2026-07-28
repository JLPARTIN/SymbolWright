import path from 'node:path'

/**
 * FIFO per-acquisition-root async mutex. Closes the race between external-repository intake and
 * retention pruning: a freshly acquired workspace exists on disk for a moment before the mission
 * that will reference it is actually created, and a concurrent prune sweep that only checks
 * "which workspaces are referenced by a mission right now" could see that workspace as orphaned
 * and quarantine it out from under the in-flight intake. Serializing the full acquire-then-create
 * sequence against the full check-then-quarantine sequence, on the same lock, closes that window.
 */
const tails = new Map<string, Promise<unknown>>()

export function withAcquisitionRootLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(root)
  const tail = tails.get(key) ?? Promise.resolve()
  const run = tail.then(fn, fn)
  tails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}
