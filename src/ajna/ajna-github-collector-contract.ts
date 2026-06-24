import type { AjnaGithubPullRequestPayload } from './ajna-github-review-normalizer.js'

export interface AjnaGithubCollectorPullRequestRef {
  readonly repository: string
  readonly pullRequestNumber: number
  readonly baseRef: string
  readonly headRef: string
  readonly headSha?: string
}

export interface AjnaGithubCollectorChangedFile {
  readonly path: string
  readonly status: 'added' | 'modified' | 'removed' | 'renamed' | 'unknown'
  readonly additions?: number
  readonly deletions?: number
}

export interface AjnaGithubCollectorCheckRun {
  readonly name: string
  readonly status: 'queued' | 'in_progress' | 'completed' | 'unknown'
  readonly conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | 'timed_out' | 'action_required' | 'unknown'
}

export interface AjnaGithubCollectorSnapshot {
  readonly pullRequest: AjnaGithubCollectorPullRequestRef
  readonly changedFiles: readonly AjnaGithubCollectorChangedFile[]
  readonly checkRuns?: readonly AjnaGithubCollectorCheckRun[]
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Ajna GitHub collector snapshot ${field} must be a non-empty string.`)
  }
}

function assertPositiveInteger(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Ajna GitHub collector snapshot ${field} must be a positive integer.`)
  }
}

function describeChangedFile(file: AjnaGithubCollectorChangedFile): string {
  const stats = [
    file.additions === undefined ? null : `${file.additions} additions`,
    file.deletions === undefined ? null : `${file.deletions} deletions`,
  ].filter((value): value is string => value !== null)

  const statsSuffix = stats.length > 0 ? ` (${stats.join(', ')})` : ''
  return `${file.path} was ${file.status}${statsSuffix}.`
}

function describeCheckRun(checkRun: AjnaGithubCollectorCheckRun): string {
  const conclusion = checkRun.conclusion === undefined ? 'no conclusion yet' : checkRun.conclusion
  return `${checkRun.name}: status ${checkRun.status}, conclusion ${conclusion}.`
}

export function buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(
  snapshot: AjnaGithubCollectorSnapshot,
): AjnaGithubPullRequestPayload {
  assertNonEmptyString(snapshot.pullRequest.repository, 'pullRequest.repository')
  assertPositiveInteger(snapshot.pullRequest.pullRequestNumber, 'pullRequest.pullRequestNumber')
  assertNonEmptyString(snapshot.pullRequest.baseRef, 'pullRequest.baseRef')
  assertNonEmptyString(snapshot.pullRequest.headRef, 'pullRequest.headRef')
  if (snapshot.pullRequest.headSha !== undefined) {
    assertNonEmptyString(snapshot.pullRequest.headSha, 'pullRequest.headSha')
  }

  if (!Array.isArray(snapshot.changedFiles) || snapshot.changedFiles.length === 0) {
    throw new Error('Ajna GitHub collector snapshot changedFiles must include at least one file.')
  }

  for (const [index, file] of snapshot.changedFiles.entries()) {
    assertNonEmptyString(file.path, `changedFiles[${index}].path`)
    assertNonEmptyString(file.status, `changedFiles[${index}].status`)
  }

  if (snapshot.checkRuns !== undefined && !Array.isArray(snapshot.checkRuns)) {
    throw new Error('Ajna GitHub collector snapshot checkRuns must be an array when provided.')
  }

  const payload: AjnaGithubPullRequestPayload = {
    repository: snapshot.pullRequest.repository,
    pullRequestNumber: snapshot.pullRequest.pullRequestNumber,
    baseRef: snapshot.pullRequest.baseRef,
    headRef: snapshot.pullRequest.headRef,
    changedFiles: snapshot.changedFiles.map((file) => file.path),
    diffEvidence: snapshot.changedFiles.map(describeChangedFile),
    ciEvidence: (snapshot.checkRuns ?? []).map(describeCheckRun),
  }

  if (snapshot.pullRequest.headSha !== undefined) {
    return {
      ...payload,
      headSha: snapshot.pullRequest.headSha,
    }
  }

  return payload
}
