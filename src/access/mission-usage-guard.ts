/**
 * Pure budget check: given a grant's already-settled spend, its configured cap (if any), and the
 * estimated cost of the call about to be reserved, decides whether the reservation may proceed.
 * Deliberately takes plain `bigint` inputs and returns a plain verdict rather than touching the
 * governance store itself, so the decision logic is trivially unit-testable in isolation from
 * SQLite -- the same pattern as `mission-concurrency-guard.ts`/`require-pull-request-guard.ts`.
 */
export interface UsageBudgetDecision {
  readonly allowed: boolean
  readonly reason?: string
}

/**
 * `capMicrodollars` of `undefined` means unlimited (matching the existing convention for every
 * other optional limit in `MissionExecutionLimits`). A cap of `0n` is a real, valid cap -- a
 * budget-limited grant with a zero-dollar allowance -- and correctly denies every call.
 */
export function checkUsageBudget(
  alreadySpentMicrodollars: bigint,
  estimatedMicrodollars: bigint,
  capMicrodollars: bigint | undefined,
): UsageBudgetDecision {
  if (capMicrodollars === undefined) return { allowed: true }

  const projected = alreadySpentMicrodollars + estimatedMicrodollars
  if (projected > capMicrodollars) {
    return {
      allowed: false,
      reason:
        `Estimated cost would bring spend to ${projected} microdollars, exceeding the ` +
        `configured cap of ${capMicrodollars} microdollars.`,
    }
  }
  return { allowed: true }
}
