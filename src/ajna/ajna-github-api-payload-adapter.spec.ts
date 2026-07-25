import { describe, expect, it } from 'vitest'

import { buildAjnaGithubPullRequestPayloadFromCollectorSnapshot } from './ajna-github-collector-contract.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna-github-review-normalizer.js'
import {
  buildAjnaGithubCollectorSnapshotFromApiPayload,
  type AjnaGithubApiCollectorPayload,
} from './ajna-github-api-payload-adapter.js'

function makePayload(
  overrides: Partial<AjnaGithubApiCollectorPayload> = {},
): AjnaGithubApiCollectorPayload {
  return {
    pullRequest: {
      repository: 'JLPARTIN/SymbolWright',
      number: 65,
      base: { ref: 'main' },
      head: {
        ref: 'ajna-readonly-collector-review-bundle',
        sha: '8f1d90b835e4570f9ace432575dee5b01512790f',
      },
    },
    files: [
      {
        filename: 'src/cli-ajna-review-pr-readonly-collector-fixture.ts',
        status: 'added',
        additions: 60,
        deletions: 0,
      },
    ],
    checkRuns: [
      {
        name: 'Validate SymbolWright',
        status: 'completed',
        conclusion: 'success',
      },
    ],
    ...overrides,
  }
}

describe('buildAjnaGithubCollectorSnapshotFromApiPayload', () => {
  it('maps offline GitHub API payloads into collector snapshots', () => {
    const snapshot = buildAjnaGithubCollectorSnapshotFromApiPayload(makePayload())

    expect(snapshot.pullRequest.repository).toBe('JLPARTIN/SymbolWright')
    expect(snapshot.pullRequest.pullRequestNumber).toBe(65)
    expect(snapshot.pullRequest.baseRef).toBe('main')
    expect(snapshot.changedFiles[0]?.path).toBe(
      'src/cli-ajna-review-pr-readonly-collector-fixture.ts',
    )
    expect(snapshot.changedFiles[0]?.status).toBe('added')
    expect(snapshot.checkRuns?.[0]?.conclusion).toBe('success')
  })

  it('feeds the existing collector snapshot and Ajna normalizer path', () => {
    const snapshot = buildAjnaGithubCollectorSnapshotFromApiPayload(makePayload())
    const reviewPayload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
    const input = normalizeGithubPullRequestForAjnaReview(reviewPayload)

    expect(input.request.subject.repository).toBe('JLPARTIN/SymbolWright')
    expect(input.request.changedFiles).toEqual(snapshot.changedFiles.map((file) => file.path))
    expect(input.findings.map((finding) => finding.id)).toEqual([
      'github-diff-evidence',
      'github-ci-evidence',
    ])
  })

  it('maps unsupported statuses to unknown instead of failing', () => {
    const snapshot = buildAjnaGithubCollectorSnapshotFromApiPayload(
      makePayload({
        files: [{ filename: 'src/unknown.ts', status: 'copied' }],
        checkRuns: [{ name: 'Custom check', status: 'waiting', conclusion: 'other' }],
      }),
    )

    expect(snapshot.changedFiles[0]?.status).toBe('unknown')
    expect(snapshot.checkRuns?.[0]?.status).toBe('unknown')
    expect(snapshot.checkRuns?.[0]?.conclusion).toBe('unknown')
  })

  it('rejects invalid required fields', () => {
    expect(() =>
      buildAjnaGithubCollectorSnapshotFromApiPayload(
        makePayload({ pullRequest: { ...makePayload().pullRequest, repository: '' } }),
      ),
    ).toThrow('pullRequest.repository must be a non-empty string')

    expect(() =>
      buildAjnaGithubCollectorSnapshotFromApiPayload(makePayload({ files: [] })),
    ).toThrow('files must include at least one file')
  })
})
