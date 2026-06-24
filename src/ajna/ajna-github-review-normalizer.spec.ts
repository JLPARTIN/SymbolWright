import { describe, expect, it } from 'vitest'

import { buildAjnaReviewPrForInput } from '../cli-ajna-review-pr.js'
import { normalizeGithubPullRequestForAjnaReview } from './ajna-github-review-normalizer.js'

function makePayload() {
  return {
    repository: 'JLPARTIN/CodeMind',
    pullRequestNumber: 58,
    baseRef: 'main',
    headRef: 'ajna-live-input-plan',
    headSha: 'abc123',
    changedFiles: ['docs/ajna-live-github-input-plan.md'],
    diffEvidence: ['docs/ajna-live-github-input-plan.md was added.'],
    ciEvidence: ['CI completed successfully for the pull request head.'],
  }
}

describe('normalizeGithubPullRequestForAjnaReview', () => {
  it('normalizes mocked GitHub PR metadata into Ajna review-pr input', () => {
    const input = normalizeGithubPullRequestForAjnaReview(makePayload(), {
      requestId: 'mock-github-pr-58',
      recommendedNextAction: 'Render the report locally and review evidence before merge.',
    })

    expect(input.request.requestId).toBe('mock-github-pr-58')
    expect(input.request.subject.repository).toBe('JLPARTIN/CodeMind')
    expect(input.request.subject.pullRequestNumber).toBe(58)
    expect(input.request.subject.commitSha).toBe('abc123')
    expect(input.request.changedFiles).toEqual(['docs/ajna-live-github-input-plan.md'])
    expect(input.findings).toHaveLength(2)
    expect(input.findings.map((finding) => finding.id)).toEqual([
      'github-diff-evidence',
      'github-ci-evidence',
    ])
    expect(input.recommendedNextAction).toBe('Render the report locally and review evidence before merge.')
  })

  it('renders through the existing deterministic Ajna review-pr path', () => {
    const input = normalizeGithubPullRequestForAjnaReview(makePayload())
    const result = buildAjnaReviewPrForInput(input)

    expect(result.output).toContain('# Ajna Review Cortex Report')
    expect(result.output).toContain('- docs/ajna-live-github-input-plan.md')
    expect(result.output).toContain('GitHub diff evidence captured')
    expect(result.output).toContain('GitHub CI evidence captured')
  })

  it('rejects missing pull request metadata', () => {
    expect(() =>
      normalizeGithubPullRequestForAjnaReview({
        ...makePayload(),
        repository: '',
      }),
    ).toThrow('repository must be a non-empty string')

    expect(() =>
      normalizeGithubPullRequestForAjnaReview({
        ...makePayload(),
        pullRequestNumber: 0,
      }),
    ).toThrow('pullRequestNumber must be a positive integer')
  })

  it('rejects invalid scalar payload fields', () => {
    expect(() =>
      normalizeGithubPullRequestForAjnaReview({
        ...makePayload(),
        repository: 42 as unknown as string,
      }),
    ).toThrow('repository must be a non-empty string')

    expect(() =>
      normalizeGithubPullRequestForAjnaReview({
        ...makePayload(),
        baseRef: {} as unknown as string,
      }),
    ).toThrow('baseRef must be a non-empty string')
  })

  it('rejects empty changed-file payloads', () => {
    expect(() =>
      normalizeGithubPullRequestForAjnaReview({
        ...makePayload(),
        changedFiles: [],
      }),
    ).toThrow('changedFiles must be an array of non-empty strings')
  })

  it('accepts absent CI evidence while preserving diff evidence', () => {
    const { ciEvidence: _ciEvidence, ...payloadWithoutCiEvidence } = makePayload()
    const input = normalizeGithubPullRequestForAjnaReview(payloadWithoutCiEvidence)

    expect(input.findings).toHaveLength(1)
    expect(input.findings[0]?.id).toBe('github-diff-evidence')
  })

  it('accepts empty optional CI evidence arrays', () => {
    const input = normalizeGithubPullRequestForAjnaReview({
      ...makePayload(),
      ciEvidence: [],
    })

    expect(input.findings).toHaveLength(1)
    expect(input.findings[0]?.id).toBe('github-diff-evidence')
  })
})
