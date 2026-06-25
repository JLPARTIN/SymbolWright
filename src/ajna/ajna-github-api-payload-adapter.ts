import type {
  AjnaGithubCollectorChangedFile,
  AjnaGithubCollectorCheckRun,
  AjnaGithubCollectorSnapshot,
} from './ajna-github-collector-contract.js'

export interface AjnaGithubApiPullRequestPayload {
  readonly repository: string
  readonly number: number
  readonly base: { readonly ref: string }
  readonly head: { readonly ref: string; readonly sha?: string }
}

export interface AjnaGithubApiFilePayload {
  readonly filename: string
  readonly status?: string
  readonly additions?: number
  readonly deletions?: number
}

export interface AjnaGithubApiCheckRunPayload {
  readonly name: string
  readonly status?: string
  readonly conclusion?: string | null
}

export interface AjnaGithubApiCollectorPayload {
  readonly pullRequest: AjnaGithubApiPullRequestPayload
  readonly files: readonly AjnaGithubApiFilePayload[]
  readonly checkRuns?: readonly AjnaGithubApiCheckRunPayload[]
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Ajna GitHub API payload ${field} must be a non-empty string.`)
  }
}

function assertPositiveInteger(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Ajna GitHub API payload ${field} must be a positive integer.`)
  }
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Ajna GitHub API payload ${field} must be a non-negative integer when provided.`)
  }
  return value
}

function mapFileStatus(status: string | undefined): AjnaGithubCollectorChangedFile['status'] {
  switch (status) {
    case 'added':
    case 'modified':
    case 'removed':
    case 'renamed':
      return status
    default:
      return 'unknown'
  }
}

function mapCheckStatus(status: string | undefined): AjnaGithubCollectorCheckRun['status'] {
  switch (status) {
    case 'queued':
    case 'in_progress':
    case 'completed':
      return status
    default:
      return 'unknown'
  }
}

function mapCheckConclusion(conclusion: string | null | undefined): AjnaGithubCollectorCheckRun['conclusion'] | undefined {
  if (conclusion === undefined || conclusion === null) {
    return undefined
  }
  switch (conclusion) {
    case 'success':
    case 'failure':
    case 'cancelled':
    case 'skipped':
    case 'neutral':
    case 'timed_out':
    case 'action_required':
      return conclusion
    default:
      return 'unknown'
  }
}

export function buildAjnaGithubCollectorSnapshotFromApiPayload(
  payload: AjnaGithubApiCollectorPayload,
): AjnaGithubCollectorSnapshot {
  assertNonEmptyString(payload.pullRequest.repository, 'pullRequest.repository')
  assertPositiveInteger(payload.pullRequest.number, 'pullRequest.number')
  assertNonEmptyString(payload.pullRequest.base.ref, 'pullRequest.base.ref')
  assertNonEmptyString(payload.pullRequest.head.ref, 'pullRequest.head.ref')
  if (payload.pullRequest.head.sha !== undefined) {
    assertNonEmptyString(payload.pullRequest.head.sha, 'pullRequest.head.sha')
  }

  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    throw new Error('Ajna GitHub API payload files must include at least one file.')
  }

  const changedFiles = payload.files.map((file, index): AjnaGithubCollectorChangedFile => {
    assertNonEmptyString(file.filename, `files[${index}].filename`)
    return {
      path: file.filename,
      status: mapFileStatus(file.status),
      additions: optionalNonNegativeInteger(file.additions, `files[${index}].additions`),
      deletions: optionalNonNegativeInteger(file.deletions, `files[${index}].deletions`),
    }
  })

  const checkRuns = (payload.checkRuns ?? []).map((checkRun, index): AjnaGithubCollectorCheckRun => {
    assertNonEmptyString(checkRun.name, `checkRuns[${index}].name`)
    return {
      name: checkRun.name,
      status: mapCheckStatus(checkRun.status),
      conclusion: mapCheckConclusion(checkRun.conclusion),
    }
  })

  return {
    pullRequest: {
      repository: payload.pullRequest.repository,
      pullRequestNumber: payload.pullRequest.number,
      baseRef: payload.pullRequest.base.ref,
      headRef: payload.pullRequest.head.ref,
      headSha: payload.pullRequest.head.sha,
    },
    changedFiles,
    checkRuns,
  }
}
