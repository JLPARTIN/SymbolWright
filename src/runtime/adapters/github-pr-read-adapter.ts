export interface GitHubPrFixture {
  readonly number: number
  readonly title: string
  readonly state: string
  readonly merged?: boolean
  readonly base?: string
  readonly head?: string
  readonly changedFiles?: readonly string[]
  readonly additions?: number
  readonly deletions?: number
}

export interface GitHubPrEvidence {
  readonly number: number
  readonly title: string
  readonly state: string
  readonly merged: boolean
  readonly base: string
  readonly head: string
  readonly changedFiles: readonly string[]
  readonly additions: number
  readonly deletions: number
}

export function adaptGitHubPrFixture(fixture: GitHubPrFixture): GitHubPrEvidence {
  return {
    number: fixture.number,
    title: fixture.title,
    state: fixture.state,
    merged: fixture.merged ?? false,
    base: fixture.base ?? 'main',
    head: fixture.head ?? 'unknown',
    changedFiles: fixture.changedFiles ?? [],
    additions: fixture.additions ?? 0,
    deletions: fixture.deletions ?? 0,
  }
}
