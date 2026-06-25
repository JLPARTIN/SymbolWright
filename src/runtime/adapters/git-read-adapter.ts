export interface GitReadSnapshot {
  readonly source: 'local-fixture'
  readonly branch?: string
  readonly commit?: string
  readonly changedFiles: readonly string[]
}

export function buildGitReadSnapshot(input: {
  readonly branch?: string
  readonly commit?: string
  readonly changedFiles?: readonly string[]
}): GitReadSnapshot {
  const snapshot: GitReadSnapshot = {
    source: 'local-fixture',
    changedFiles: input.changedFiles ?? [],
  }

  return {
    ...snapshot,
    ...(input.branch === undefined ? {} : { branch: input.branch }),
    ...(input.commit === undefined ? {} : { commit: input.commit }),
  }
}
