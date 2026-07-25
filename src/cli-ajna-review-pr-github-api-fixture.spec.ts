import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  parseAjnaGithubApiReviewFixture,
  renderAjnaReviewPrGithubApiFixtureForFile,
} from './cli-ajna-review-pr-github-api-fixture.js'

const tempDirs: string[] = []

function makeFixture(): unknown {
  return {
    pullRequest: {
      repository: 'JLPARTIN/SymbolWright',
      number: 66,
      base: { ref: 'main' },
      head: {
        ref: 'ajna-github-api-payload-adapter-bundle',
        sha: 'a9cc72a0fe1a92b04f8e3607fdb2f2a32b38cd6b',
      },
    },
    files: [{ filename: 'src/ajna/ajna-github-api-payload-adapter.ts', status: 'added' }],
    checkRuns: [{ name: 'Validate SymbolWright', status: 'completed', conclusion: 'success' }],
  }
}

function writeFixtureFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-api-review-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'api-payload.json')
  writeFileSync(inputPath, JSON.stringify(input), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseAjnaGithubApiReviewFixture', () => {
  it('accepts an object fixture', () => {
    const parsed = parseAjnaGithubApiReviewFixture(JSON.stringify(makeFixture()))

    expect(parsed.pullRequest.repository).toBe('JLPARTIN/SymbolWright')
    expect(parsed.pullRequest.number).toBe(66)
  })

  it('rejects non-object JSON', () => {
    expect(() => parseAjnaGithubApiReviewFixture('[]')).toThrow(
      'API review fixture must be an object',
    )
  })
})

describe('renderAjnaReviewPrGithubApiFixtureForFile', () => {
  it('renders an offline GitHub-shaped payload through Ajna review-pr', () => {
    const output = renderAjnaReviewPrGithubApiFixtureForFile(writeFixtureFile(makeFixture()))

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('GitHub diff evidence captured')
    expect(output).toContain('GitHub CI evidence captured')
    expect(output).toContain('src/ajna/ajna-github-api-payload-adapter.ts')
  })
})
