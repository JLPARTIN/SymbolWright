/**
 * An in-process, per-key async mutex. `PersistentMissionExecutor` and `AutonomousMissionControl`
 * both read-modify-write the same persisted execution record; without this, a `run()` loop can
 * read stale state, execute a task, and write a result that silently overwrites a concurrent
 * `/autonomy/cancel` request's mutation (the state-transition race a bare pre-write revision
 * check alone cannot close, since the gap between the comparison and the write is exactly where
 * another writer can slip in). Both classes are constructed with the *same* injected instance
 * (see `autonomous-mission-runtime.ts`) so their read-modify-write sequences serialize against
 * each other, not just against themselves.
 */
export class MissionExecutionLock {
  readonly #tails = new Map<string, Promise<unknown>>()

  /** Runs `fn` only after every previously-queued `withLock` call for the same `key` has
   * settled (resolved or rejected), and before any call queued after this one starts. A
   * rejection from `fn` propagates to this call's caller but never blocks the next one. */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.#tails.get(key) ?? Promise.resolve()
    const run = tail.then(fn, fn)
    this.#tails.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }
}
