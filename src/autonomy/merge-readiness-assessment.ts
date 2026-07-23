import type {
  RepositoryImpactAnalysis,
  RepositoryImpactRisk,
} from './repository-impact-analysis.js'

export type MergeReadinessDecision = 'ready' | 'review-required' | 'blocked'

export interface MergeReadinessValidation {
  readonly command: string
  readonly passed: boolean
  readonly durationMs?: number
}

export interface MergeReadinessAssessment {
  readonly decision: MergeReadinessDecision
  readonly score: number
  readonly impactRisk: RepositoryImpactRisk
  readonly passedValidations: readonly string[]
  readonly failedValidations: readonly string[]
  readonly missingValidations: readonly string[]
  readonly unresolvedDiagnostics: readonly string[]
  readonly evidenceCount: number
  readonly reasons: readonly string[]
}

export function assessMergeReadiness(input: {
  readonly impact: RepositoryImpactAnalysis
  readonly validations: readonly MergeReadinessValidation[]
  readonly unresolvedDiagnostics?: readonly string[]
  readonly evidenceCount: number
}): MergeReadinessAssessment {
  const required = new Set(input.impact.validationCommands)
  const passed = input.validations
    .filter((validation) => validation.passed)
    .map((item) => item.command)
  const failed = input.validations
    .filter((validation) => !validation.passed)
    .map((item) => item.command)
  const observed = new Set(input.validations.map((validation) => validation.command))
  const missing = [...required].filter((command) => !observed.has(command)).sort()
  const diagnostics = [...new Set(input.unresolvedDiagnostics ?? [])].sort()

  let score = 100
  score -= impactPenalty(input.impact.risk)
  score -= failed.length * 30
  score -= missing.length * 12
  score -= Math.min(25, diagnostics.length * 5)
  if (input.evidenceCount === 0) score -= 20
  score = Math.max(0, Math.min(100, score))

  const reasons: string[] = []
  if (failed.length > 0) reasons.push(`${failed.length} required validation commands failed.`)
  if (missing.length > 0)
    reasons.push(`${missing.length} required validation commands have not run.`)
  if (diagnostics.length > 0) reasons.push(`${diagnostics.length} unresolved diagnostics remain.`)
  if (input.evidenceCount === 0) reasons.push('No execution evidence is attached.')
  if (input.impact.risk === 'critical' || input.impact.risk === 'high') {
    reasons.push(`Repository impact risk is ${input.impact.risk}.`)
  }
  if (reasons.length === 0) reasons.push('Required validation and evidence gates are satisfied.')

  const blocked = failed.length > 0 || diagnostics.length > 0
  const decision: MergeReadinessDecision = blocked
    ? 'blocked'
    : missing.length > 0 ||
        input.evidenceCount === 0 ||
        input.impact.risk === 'critical' ||
        score < 80
      ? 'review-required'
      : 'ready'

  return {
    decision,
    score,
    impactRisk: input.impact.risk,
    passedValidations: [...new Set(passed)].sort(),
    failedValidations: [...new Set(failed)].sort(),
    missingValidations: missing,
    unresolvedDiagnostics: diagnostics,
    evidenceCount: input.evidenceCount,
    reasons,
  }
}

function impactPenalty(risk: RepositoryImpactRisk): number {
  if (risk === 'critical') return 30
  if (risk === 'high') return 18
  if (risk === 'medium') return 8
  return 0
}
