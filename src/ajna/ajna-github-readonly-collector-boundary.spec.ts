import { describe, expect, it } from 'vitest'

import { buildAjnaGithubPullRequestPayloadFromCollectorSnapshot } from './ajna-github-collector-contract.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna-github-review-normalizer.js'
import {
  collectAjnaGithubReadOnlySnapshot,
  validateAjnaGithubReadOnlyCollectorRequest,
  type AjnaGithubReadOnlyCollectorPort,
} from './ajna-github-readonly-collector-boundary.js'

describe('validateAjnaGithubReadOnlyCollectorRequest', () => {
  it('accepts a repository and pull request number', () => {
    const request = validateAjnaGithubReadOnlyCollectorRequest({
      repository: 'JLPARTIN/CodeMind',
      pullRequestNumber: 62,
    })

    expect(request.repository).toBe('JLPARTIN/CodeMind')
    expect(request.pullRequestNumber).toBe(62)
  })

  it('rejects invalid request fields', () => {
    expect(() =>
      validateAjnaGithubReadOnlyCollectorRequest({
        repository: '',
        pullRequestNumber: 62,
      }),
    ).toThrow('repository must be a non-empty string')

    expect(() =>
      validateAjnaGithubReadOnlyCollectorRequest({
        repository: 'JLPARTIN/CodeMind',
        pullRequestNumber: 0,
      }),
    ).toThrow('pullRequestNumber must be a positive integer')
  })
})

describe('collectAjnaGithubReadOnlySnapshot', () => {
  it('collects through an injected read-only port', async () => {
    const port: AjnaGithubReadOnlyCollectorPort = {
      collect: async (request) => ({
        pullRequest: {
          repository: request.repository,
          pullRequestNumber: request.pullRequestNumber,
          baseRef: 'main',
          headRef: 'ajna-collector-fixture-command-bundle',
          headSha: '84647bb4e26155e68cf7a8ee8a5f27ebda544197',
        },
        changedFiles: [
          {
            path: 'src/cli-ajna-review-pr-collector-fixture.ts',
            status: 'added',
            additions: 30,
            deletions: 0,
          },
        ],
        checkRuns: [
          {
            name: 'Validate CodeMind',
            status: 'completed',
            conclusion: 'success',
          },
        ],
      }),
    }

    const snapshot = await collectAjnaGithubReadOnlySnapshot(port, {
      repository: 'JLPARTIN/CodeMind',
      pullRequestNumber: 62,
    })

    expect(snapshot.pullRequest.repository).toBe('JLPARTIN/CodeMind')
    expect(snapshot.changedFiles.map((file) => file.path)).toEqual([
      'src/cli-ajna-review-pr-collector-fixture.ts',
    ])
  })

  it('feeds the collector snapshot into the existing Ajna path', async () => {
    const port: AjnaGithubReadOnlyCollectorPort = {
      collect: async (request) => ({
        pullRequest: {
          repository: request.repository,
          pullRequestNumber: request.pullRequestNumber,
          baseRef: 'main',
          headRef: 'ajna-collector-fixture-command-bundle',
        },
        changedFiles: [
          {
            path: 'docs/ajna-review-pr-collector-fixture.md',
            status: 'added',
          },
        ],
      }),
    }

    const snapshot = await collectAjnaGithubReadOnlySnapshot(port, {
      repository: 'JLPARTIN/CodeMind',
      pullRequestNumber: 62,
    })
    const payload = buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
    const input = normalizeGithubPullRequestForAjnaReview(payload)

    expect(input.request.subject.repository).toBe('JLPARTIN/CodeMind')
    expect(input.request.changedFiles).toEqual(['docs/ajna-review-pr-collector-fixture.md'])
    expect(input.findings.map((finding) => finding.id)).toEqual(['github-diff-evidence'])
  })
})
