import type { ClientConstraints, MissionExecutionLimits, SessionLimits } from './access-types.js'

/**
 * `AccessGrantService.narrowGrant` promises a PATCH can only shrink what a grant allows, never
 * widen it -- but until this module existed, `executionLimits`/`sessionLimits`/`clientConstraints`
 * were merged with a plain object spread (`{ ...current, ...patch }`), which happily accepts a
 * *larger* `maxConcurrentMissions`, a *longer* `maxSessionDurationMinutes`, flipping
 * `allowDirectPush` from `false` to `true`, or replacing a restrictive `allowedIpCidrs` allowlist
 * with a broader one. These functions are the actual monotonicity check: each field's "stricter"
 * direction is field-specific (smaller is stricter for a numeric cap; for an allow-flag like
 * `allowDirectPush`/`sandboxNetworkAccess`, `true`/unset is loosest and only `false` narrows; for a
 * require-flag like `requirePullRequest`/`singleUse`, `false`/unset is loosest and only `true`
 * narrows; for an allowlist array, unset or empty is loosest and narrowing means replacing it with
 * a *subset* of the current list, never a list containing anything new).
 *
 * Each `findXWideningViolation` returns the first violation message found, or `undefined` when the
 * patch is a valid narrowing (or no-op). Returning rather than throwing keeps this module free of
 * `GrantValidationError`, so `access-grant-service.ts` (which defines that error) can import these
 * checks without a circular dependency.
 */

function isNarrowerOrEqualCap(current: number | undefined, next: number | undefined): boolean {
  if (next === undefined) return true
  if (current === undefined) return true
  return next <= current
}

/** `true` (or unset, which behaves as `true` at enforcement) is the loosest state; only an
 * explicit `false` narrows, and only when the current value isn't already `false`. */
function isNarrowerOrEqualAllowFlag(
  current: boolean | undefined,
  next: boolean | undefined,
): boolean {
  if (next === undefined) return true
  if (next === true) return current !== false
  return true
}

/** `false` (or unset) is the loosest state; only an explicit `true` narrows, and it's always a
 * valid narrowing (going from "not required" to "required" can never widen access). */
function isNarrowerOrEqualRequireFlag(
  current: boolean | undefined,
  next: boolean | undefined,
): boolean {
  if (next === undefined) return true
  if (next === false) return current !== true
  return true
}

function isSubsetAllowlist(
  current: readonly string[] | undefined,
  next: readonly string[] | undefined,
): boolean {
  if (next === undefined) return true
  const currentRestricted = current !== undefined && current.length > 0
  if (!currentRestricted) return true
  // An empty replacement list would remove the restriction entirely (every enforcement check here
  // treats `length === 0` the same as unset), which is a widening, not a narrowing.
  if (next.length === 0) return false
  const currentSet = new Set(current)
  return next.every((entry) => currentSet.has(entry))
}

export function findExecutionLimitsWideningViolation(
  current: MissionExecutionLimits,
  patch: MissionExecutionLimits,
): string | undefined {
  if (!isNarrowerOrEqualCap(current.maxConcurrentMissions, patch.maxConcurrentMissions)) {
    return 'PATCH can only lower executionLimits.maxConcurrentMissions, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.maxMissionDurationMinutes, patch.maxMissionDurationMinutes)) {
    return 'PATCH can only lower executionLimits.maxMissionDurationMinutes, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.maxRepairAttempts, patch.maxRepairAttempts)) {
    return 'PATCH can only lower executionLimits.maxRepairAttempts, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.maxFilesChanged, patch.maxFilesChanged)) {
    return 'PATCH can only lower executionLimits.maxFilesChanged, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.maxDiffLines, patch.maxDiffLines)) {
    return 'PATCH can only lower executionLimits.maxDiffLines, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.maxCommits, patch.maxCommits)) {
    return 'PATCH can only lower executionLimits.maxCommits, never raise it.'
  }
  if (!isNarrowerOrEqualAllowFlag(current.sandboxNetworkAccess, patch.sandboxNetworkAccess)) {
    return 'PATCH can only turn executionLimits.sandboxNetworkAccess off, never on.'
  }
  if (!isNarrowerOrEqualAllowFlag(current.allowDirectPush, patch.allowDirectPush)) {
    return 'PATCH can only turn executionLimits.allowDirectPush off, never on.'
  }
  if (!isNarrowerOrEqualRequireFlag(current.requirePullRequest, patch.requirePullRequest)) {
    return 'PATCH can only turn executionLimits.requirePullRequest on, never off.'
  }
  if (!isSubsetAllowlist(current.allowedCommands, patch.allowedCommands)) {
    return 'PATCH can only shrink executionLimits.allowedCommands to a subset of the current list, never add to it.'
  }
  return undefined
}

export function findSessionLimitsWideningViolation(
  current: SessionLimits,
  patch: SessionLimits,
): string | undefined {
  if (!isNarrowerOrEqualCap(current.maxConcurrentSessions, patch.maxConcurrentSessions)) {
    return 'PATCH can only lower sessionLimits.maxConcurrentSessions, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.maxSessionDurationMinutes, patch.maxSessionDurationMinutes)) {
    return 'PATCH can only lower sessionLimits.maxSessionDurationMinutes, never raise it.'
  }
  if (!isNarrowerOrEqualCap(current.inactivityTimeoutMinutes, patch.inactivityTimeoutMinutes)) {
    return 'PATCH can only lower sessionLimits.inactivityTimeoutMinutes, never raise it.'
  }
  if (!isNarrowerOrEqualRequireFlag(current.singleUse, patch.singleUse)) {
    return 'PATCH can only turn sessionLimits.singleUse on, never off.'
  }
  return undefined
}

export function findClientConstraintsWideningViolation(
  current: ClientConstraints | undefined,
  patch: ClientConstraints,
): string | undefined {
  if (!isSubsetAllowlist(current?.allowedIpCidrs, patch.allowedIpCidrs)) {
    return 'PATCH can only shrink clientConstraints.allowedIpCidrs to a subset of the current list, never add to it.'
  }
  if (!isSubsetAllowlist(current?.allowedClientIds, patch.allowedClientIds)) {
    return 'PATCH can only shrink clientConstraints.allowedClientIds to a subset of the current list, never add to it.'
  }
  return undefined
}
