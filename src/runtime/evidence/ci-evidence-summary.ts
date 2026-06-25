import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'

export interface RuntimeCiEvidenceSummary {
  readonly title: string
  readonly lines: readonly string[]
}

export function buildCiEvidenceSummary(evidence: GitHubCiEvidence): RuntimeCiEvidenceSummary {
  return {
    title: `Workflow ${evidence.workflow}`,
    lines: [
      `Result: ${evidence.conclusion}`,
      `Job count: ${evidence.jobs.length}`,
      ...evidence.jobs.map((job) => `Job ${job.name}: ${job.status} / ${job.conclusion}`),
    ],
  }
}
