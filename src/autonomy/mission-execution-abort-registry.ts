/**
 * In-process signal that lets a concurrent `/autonomy/cancel`/`/autonomy/pause` request reach an
 * already-running `PersistentMissionExecutor.run()` loop. Before this existed, cancel/pause only
 * flipped persisted JSON state -- the `run()` loop (which lives entirely inside the original
 * `/autonomy/start` request's call stack) had no way to observe it and kept executing tasks until
 * the whole graph finished or its own duration budget tripped.
 *
 * Deliberately an **instantiated, injected** class -- not a module-level singleton -- so it's
 * testable in isolation and doesn't leak state across test files. `createAutonomousMissionRuntime`
 * constructs exactly one instance and shares it between the executor and the control surface.
 */

export type MissionExecutionAbortReason = 'operator' | 'shutdown' | 'budget' | 'duration' | 'system'

export type MissionExecutionRegisterResult =
  { readonly ok: true; readonly signal: AbortSignal } | { readonly ok: false }

export class MissionExecutionAbortRegistry {
  readonly #controllers = new Map<string, AbortController>()

  /** Registers a new in-flight execution for `missionId`. Returns `{ ok: false }` instead of
   * silently replacing an existing controller when one is already registered -- a second
   * concurrent `start`/`resume` for the same mission must be rejected (`409 already_running`) by
   * the caller, not allowed to create a second, uncoordinated in-flight loop. */
  registerIfAbsent(missionId: string): MissionExecutionRegisterResult {
    if (this.#controllers.has(missionId)) return { ok: false }
    const controller = new AbortController()
    this.#controllers.set(missionId, controller)
    return { ok: true, signal: controller.signal }
  }

  /** Always call from a `finally` around the run, on every exit path (completion, error, abort,
   * duration-exceeded) -- an execution that's no longer running must not keep occupying the
   * "already running" slot. */
  release(missionId: string): void {
    this.#controllers.delete(missionId)
  }

  /** Returns `false` (informational only) when nothing is currently registered for `missionId` --
   * i.e. no in-flight `run()` for that mission right now. The persisted JSON-state mutation the
   * caller already performs is still the durable source of truth for a mission that isn't
   * currently executing; this only short-circuits an *active* loop. */
  requestAbort(missionId: string, reason: MissionExecutionAbortReason): boolean {
    const controller = this.#controllers.get(missionId)
    if (controller === undefined) return false
    controller.abort(reason)
    return true
  }

  isRegistered(missionId: string): boolean {
    return this.#controllers.has(missionId)
  }

  /** Every mission id with an in-flight execution right now -- used at graceful-shutdown time to
   * abort everything still running rather than only a single named mission. */
  activeMissionIds(): readonly string[] {
    return [...this.#controllers.keys()]
  }

  /** Aborts every currently-registered execution with `reason`. Returns the ids that were
   * actually aborted (empty when nothing was running). */
  requestAbortAll(reason: MissionExecutionAbortReason): readonly string[] {
    const ids = this.activeMissionIds()
    for (const missionId of ids) this.requestAbort(missionId, reason)
    return ids
  }
}

export function abortReasonOf(signal: AbortSignal): MissionExecutionAbortReason | undefined {
  if (!signal.aborted) return undefined
  const reason = signal.reason as unknown
  return typeof reason === 'string' &&
    (reason === 'operator' ||
      reason === 'shutdown' ||
      reason === 'budget' ||
      reason === 'duration' ||
      reason === 'system')
    ? reason
    : 'system'
}
