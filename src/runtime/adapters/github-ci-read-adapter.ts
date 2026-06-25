export interface GitHubCiJobFixture {
  readonly name: string
  readonly conclusion?: string
  readonly status?: string
  readonly summary?: string
}

export interface GitHubCiFixture {
  readonly workflow: string
  readonly conclusion?: string
  readonly jobs?: readonly GitHubCiJobFixture[]
}

export interface GitHubCiEvidence {
  readonly workflow: string
  readonly conclusion: string
  readonly jobs: readonly Required<GitHubCiJobFixture>[]
}

export function adaptGitHubCiFixture(fixture: GitHubCiFixture): GitHubCiEvidence {
  return {
    workflow: fixture.workflow,
    conclusion: fixture.conclusion ?? 'unknown',
    jobs: (fixture.jobs ?? []).map((job) => ({
      name: job.name,
      conclusion: job.conclusion ?? 'unknown',
      status: job.status ?? 'unknown',
      summary: job.summary ?? '',
    })),
  }
}
