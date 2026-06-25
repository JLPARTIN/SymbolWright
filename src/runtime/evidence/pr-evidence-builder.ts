import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'

export interface RuntimePrEvidenceSummary {
  readonly title: string
  readonly lines: readonly string[]
}

export function buildPrEvidenceSummary(evidence: GitHubPrEvidence): RuntimePrEvidenceSummary {
  return {
    title: `PR #${evidence.number}: ${evidence.title}`,
    lines: [
      `State: ${evidence.state}`,
      `Merged: ${evidence.merged ? 'yes' : 'no'}`,
      `Base: ${evidence.base}`,
      `Head: ${evidence.head}`,
      `Changed files: ${evidence.changedFiles.length}`,
      `Additions: ${evidence.additions}`,
      `Deletions: ${evidence.deletions}`,
      ...evidence.changedFiles.map((file) => `File: ${file}`),
    ],
  }
}
