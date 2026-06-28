import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildAjnaReviewPrForGithubFixture,
  parseAjnaGithubPullRequestFixture,
  renderAjnaReviewPrGithubFixtureForFile,
} from './cli-ajna-review-pr-github-fixture.js'
import type { AjnaGithubPullRequestPayload } from './ajna/ajna-github-review-normalizer.js'

const tempDirs: string[] = []

function makePayload(
  overrides: Partial<AjnaGithubPullRequestPayload> = {},
): AjnaGithubPullRequestPayload {
  return {
    repository: 'JLPARTIN/CodeMind',
    pullRequestNumber: 59,
    baseRef: 'main',
    headRef: 'ajna-github-payload-normalizer',
    headSha: '17ada8661847dddd8ed181267789d3a77d0f37d4',
    changedFiles: ['src/ajna/ajna-github-review-normalizer.ts'],
    diffEvidence: [
      'The normalizer converts mocked GitHub pull request payloads into Ajna review input.',
    ],
    ciEvidence: ['CI completed successfully for the mocked pull request head.'],
    ...overrides,
  }
}

function writePayloadFile(payload: AjnaGithubPullRequestPayload): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'codemind-ajna-github-fixture-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'github-pr-payload.json')
  writeFileSync(inputPath, JSON.stringify(payload), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseAjnaGithubPullRequestFixture', () => {
  it('accepts object fixture JSON', () => {
    const payload = parseAjnaGithubPullRequestFixture(JSON.stringify(makePayload()))

    expect(payload.repository).toBe('JLPARTIN/CodeMind')
    expect(payload.pullRequestNumber).toBe(59)
  })

  it('rejects non-object fixture JSON', () => {
    expect(() => parseAjnaGithubPullRequestFixture('[]')).toThrow(
      'GitHub review fixture input must be an object',
    )
  })
})

describe('buildAjnaReviewPrForGithubFixture', () => {
  it('normalizes and renders the mocked GitHub fixture through Ajna review-pr', () => {
    const result = buildAjnaReviewPrForGithubFixture(makePayload())

    expect(result.response.requestId).toBe('github-pr-59')
    expect(result.response.subject.repository).toBe('JLPARTIN/CodeMind')
    expect(result.output).toContain('# Ajna Review Cortex Report')
    expect(result.output).toContain('GitHub diff evidence captured')
    expect(result.output).toContain('GitHub CI evidence captured')
  })

  it('preserves changed files with no CI evidence summaries', () => {
    const result = buildAjnaReviewPrForGithubFixture(makePayload({ ciEvidence: [] }))

    expect(result.response.changedFiles).toEqual(['src/ajna/ajna-github-review-normalizer.ts'])
    expect(result.output).toContain('- src/ajna/ajna-github-review-normalizer.ts')
  })
})

describe('renderAjnaReviewPrGithubFixtureForFile', () => {
  it('renders a local mocked GitHub fixture file', () => {
    const output = renderAjnaReviewPrGithubFixtureForFile(writePayloadFile(makePayload()))

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('## Merge-Readiness')
    expect(output).toContain('## Recommended Next Action')
  })
})
