import type { RuntimeCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import type { RuntimePrEvidenceSummary } from '../evidence/pr-evidence-builder.js'

export interface RuntimeAjnaEvidenceBridgeOutput {
  readonly verdict: 'READY' | 'NEEDS_WORK'
  readonly notes: readonly string[]
}

export function bridgeRuntimeEvidenceToAjna(input: {
  readonly pr?: RuntimePrEvidenceSummary
  readonly ci?: RuntimeCiEvidenceSummary
}): RuntimeAjnaEvidenceBridgeOutput {
  const notes: string[] = []

  if (input.pr !== undefined) {
    notes.push(input.pr.title)
    notes.push(...input.pr.lines)
  }

  if (input.ci !== undefined) {
    notes.push(input.ci.title)
    notes.push(...input.ci.lines)
  }

  return {
    verdict: notes.length > 0 ? 'READY' : 'NEEDS_WORK',
    notes,
  }
}
