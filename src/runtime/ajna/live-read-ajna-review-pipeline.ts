import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import { buildPrEvidenceSummary } from '../evidence/pr-evidence-builder.js'
import { buildCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import {
  bridgeRuntimeEvidenceToAjna,
  type RuntimeAjnaEvidenceBridgeOutput,
} from './runtime-ajna-evidence-bridge.js'

export interface LiveReadAjnaReviewInput {
  readonly pr?: GitHubPrEvidence
  readonly ci?: GitHubCiEvidence
}

export interface LiveReadAjnaReviewResult {
  readonly verdict: 'READY' | 'NEEDS_WORK'
  readonly notes: readonly string[]
  readonly findings: readonly string[]
}

export function runLiveReadAjnaReview(input: LiveReadAjnaReviewInput): LiveReadAjnaReviewResult {
  const bridgeInput = {
    ...(input.pr !== undefined ? { pr: buildPrEvidenceSummary(input.pr) } : {}),
    ...(input.ci !== undefined ? { ci: buildCiEvidenceSummary(input.ci) } : {}),
  }

  const bridge: RuntimeAjnaEvidenceBridgeOutput = bridgeRuntimeEvidenceToAjna(bridgeInput)

  const findings: string[] = []

  if (input.pr === undefined && input.ci === undefined) {
    findings.push('No evidence provided for review.')
  }

  if (input.pr !== undefined && input.pr.state === 'closed' && !input.pr.merged) {
    findings.push('PR is closed without merge.')
  }

  if (input.ci !== undefined && input.ci.conclusion !== 'success') {
    findings.push(`CI conclusion is ${input.ci.conclusion}, not success.`)
  }

  return {
    verdict: findings.length === 0 ? bridge.verdict : 'NEEDS_WORK',
    notes: bridge.notes,
    findings,
  }
}

export function renderLiveReadAjnaReview(result: LiveReadAjnaReviewResult): string {
  const sections: string[] = [
    'SymbolWright Ajna live-read review',
    '',
    `Verdict: ${result.verdict}`,
  ]

  if (result.notes.length > 0) {
    sections.push('', 'Evidence notes:')
    sections.push(...result.notes.map((note) => `- ${note}`))
  }

  if (result.findings.length > 0) {
    sections.push('', 'Findings:')
    sections.push(...result.findings.map((finding) => `- ${finding}`))
  }

  sections.push(
    '',
    'Boundary:',
    '- read-only evidence review',
    '- no comments are posted',
    '- no review submissions',
    '- no merges are performed',
  )

  return sections.join('\n')
}
