import { describe, expect, it } from 'vitest'

import { normalizeGithubPullRequestForAjnaReview } from './ajna-github-review-normalizer.js'
import {
  buildAjnaGithubPullRequestPayloadFromCollectorSnapshot,
  type AjnaGithubCollectorSnapshot,
} from './ajna-github-collector-contract.js'

function makeSnapshot(
  overrides: Partial<AjnaGithubCollectorSnapshot> = {},
): AjnaGithubCollectorSnapshot {
  return {
    pullRequest: {
      repository: 'JLPARTIN/SymbolWright',
      pullRequestNumber: 60,
      baseRef: 'main',
      headRef: 'ajna-github-review-input-bundle',
      headSha: 'd20856ee90875e9c82bf254f0908dab2b0856a35',
    },
    changedFiles: [
      {
        path: 'src/cli-ajna-review-pr-github-fixture.ts',
        status: 'added',
        additions: 35,
        deletions: 0,
      },
      {
        path: 'src/cli.ts',
        status: 'modified',
        additions: 9,
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

describe('buildAjnaGithubPullRequestPayloadFromCollectorSnapshot', () => {
  it('maps a collector snapshot into a normalizer payload', () => {
    const payload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(makeSnapshot())

    expect(payload.repository).toBe('JLPARTIN/SymbolWright')
    expect(payload.pullRequestNumber).toBe(60)
    expect(payload.headSha).toBe('d20856ee90875e9c82bf254f0908dab2b0856a35')
    expect(payload.changedFiles).toEqual(['src/cli-ajna-review-pr-github-fixture.ts', 'src/cli.ts'])
    expect(payload.diffEvidence).toEqual([
      'src/cli-ajna-review-pr-github-fixture.ts was added (35 additions, 0 deletions).',
      'src/cli.ts was modified (9 additions, 0 deletions).',
    ])
    expect(payload.ciEvidence).toEqual([
      'Validate SymbolWright: status completed, conclusion success.',
    ])
  })

  it('feeds the existing Ajna GitHub payload normalizer', () => {
    const payload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(makeSnapshot())
    const input = normalizeGithubPullRequestForAjnaReview(payload)

    expect(input.request.subject.repository).toBe('JLPARTIN/SymbolWright')
    expect(input.request.changedFiles).toEqual(payload.changedFiles)
    expect(input.findings.map((finding) => finding.id)).toEqual([
      'github-diff-evidence',
      'github-ci-evidence',
    ])
  })

  it('allows absent check runs as an empty CI evidence array', () => {
    const { checkRuns: _checkRuns, ...snapshotWithoutChecks } = makeSnapshot()
    const payload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshotWithoutChecks)

    expect(payload.ciEvidence).toEqual([])
    expect(normalizeGithubPullRequestForAjnaReview(payload).findings).toHaveLength(1)
  })

  it('rejects missing pull request identity', () => {
    expect(() =>
      buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(
        makeSnapshot({
          pullRequest: {
            ...makeSnapshot().pullRequest,
            repository: '',
          },
        }),
      ),
    ).toThrow('pullRequest.repository must be a non-empty string')
  })

  it('rejects empty changed file snapshots', () => {
    expect(() =>
      buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(makeSnapshot({ changedFiles: [] })),
    ).toThrow('changedFiles must include at least one file')
  })
})
