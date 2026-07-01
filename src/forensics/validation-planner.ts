import type { ChangedFileAnalysis, MatchedFailureRule, ValidationPlan } from './types.js'

export const RELEASE_READINESS_SCRIPT = 'release-readiness' as const

function unique(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort()
}

export function planValidation(
  changedFiles: readonly ChangedFileAnalysis[],
  matchedFailures: readonly MatchedFailureRule[],
): ValidationPlan {
  const requiredScripts = new Set<string>()
  const forensicGates = new Set<string>()
  const failuresPrevented = new Set<string>()

  for (const file of changedFiles) {
    if (file.requiresFormat) requiredScripts.add('format:check')
    if (file.requiresLint) requiredScripts.add('lint')
    if (file.requiresTypecheck) requiredScripts.add('typecheck')
    if (file.requiresTest) requiredScripts.add('test')
    if (file.requiresBuild) requiredScripts.add('build')

    for (const gate of file.forensicGates) {
      forensicGates.add(gate)
      requiredScripts.add(RELEASE_READINESS_SCRIPT)
    }
  }

  for (const matchedFailure of matchedFailures) {
    forensicGates.add(`failure-ledger:${matchedFailure.failureClass}`)
    failuresPrevented.add(matchedFailure.failureClass)

    if (matchedFailure.failureClass === 'FORMAT_CHECK_FAILURE') {
      requiredScripts.add('format:check')
    }
  }

  return {
    requiredScripts: unique(requiredScripts),
    forensicGates: unique(forensicGates),
    failuresPrevented: unique(failuresPrevented),
  }
}
