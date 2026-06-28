import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'

export interface LiveReadAjnaMergeReadinessInput {
  readonly pr: GitHubPrEvidence
  readonly ci?: GitHubCiEvidence
}

export interface LiveReadAjnaMergeReadinessResult {
  readonly ready: boolean
  readonly blockers: readonly string[]
  readonly summary: readonly string[]
}

export function assessLiveReadMergeReadiness(
  input: LiveReadAjnaMergeReadinessInput,
): LiveReadAjnaMergeReadinessResult {
  const blockers: string[] = []
  const summary: string[] = []

  summary.push(`PR #${input.pr.number}: ${input.pr.title}`)
  summary.push(`State: ${input.pr.state}`)
  summary.push(`Merged: ${input.pr.merged ? 'yes' : 'no'}`)
  summary.push(`Changed files: ${input.pr.changedFiles.length}`)

  if (input.pr.state !== 'open') {
    blockers.push(`PR state is ${input.pr.state}, expected open.`)
  }

  if (input.pr.merged) {
    blockers.push('PR is already merged.')
  }

  if (input.ci !== undefined) {
    summary.push(`CI workflow: ${input.ci.workflow}`)
    summary.push(`CI conclusion: ${input.ci.conclusion}`)

    if (input.ci.conclusion !== 'success') {
      blockers.push(`CI conclusion is ${input.ci.conclusion}, not success.`)
    }

    const failedJobs = input.ci.jobs.filter((job) => job.conclusion !== 'success')
    for (const job of failedJobs) {
      blockers.push(`Job ${job.name} concluded with ${job.conclusion}.`)
    }
  } else {
    blockers.push('No CI evidence provided.')
  }

  return {
    ready: blockers.length === 0,
    blockers,
    summary,
  }
}

export function renderLiveReadAjnaMergeReadiness(result: LiveReadAjnaMergeReadinessResult): string {
  const sections: string[] = [
    'CodeMind Ajna live-read merge readiness',
    '',
    `Ready: ${result.ready ? 'YES' : 'NO'}`,
  ]

  if (result.summary.length > 0) {
    sections.push('', 'Summary:')
    sections.push(...result.summary.map((line) => `- ${line}`))
  }

  if (result.blockers.length > 0) {
    sections.push('', 'Blockers:')
    sections.push(...result.blockers.map((blocker) => `- ${blocker}`))
  }

  sections.push(
    '',
    'Boundary:',
    '- read-only merge readiness assessment',
    '- no merge is performed',
    '- no comments are posted',
    '- no labels are written',
    '- no workflow reruns are requested',
  )

  return sections.join('\n')
}
