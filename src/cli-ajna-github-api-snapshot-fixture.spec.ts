import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  parseAjnaGithubApiSnapshotFixture,
  renderAjnaGithubApiSnapshotFixtureForFile,
} from './cli-ajna-github-api-snapshot-fixture.js'

const tempDirs: string[] = []

function makeFixture(): unknown {
  return {
    pullRequest: {
      repository: 'JLPARTIN/SymbolWright',
      number: 67,
      base: { ref: 'main' },
      head: {
        ref: 'ajna-github-api-review-cli-bundle',
        sha: '8c124100bdf82355b31d12528985d48fba8336c0',
      },
    },
    files: [{ filename: 'src/cli-ajna-review-pr-github-api-fixture.ts', status: 'added' }],
    checkRuns: [{ name: 'Validate SymbolWright', status: 'completed', conclusion: 'success' }],
  }
}

function writeFixtureFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-api-snapshot-'))
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

describe('parseAjnaGithubApiSnapshotFixture', () => {
  it('accepts an object fixture', () => {
    const parsed = parseAjnaGithubApiSnapshotFixture(JSON.stringify(makeFixture()))

    expect(parsed.pullRequest.repository).toBe('JLPARTIN/SymbolWright')
    expect(parsed.pullRequest.number).toBe(67)
  })

  it('rejects non-object JSON', () => {
    expect(() => parseAjnaGithubApiSnapshotFixture('[]')).toThrow(
      'API snapshot fixture must be an object',
    )
  })
})

describe('renderAjnaGithubApiSnapshotFixtureForFile', () => {
  it('renders collector snapshot JSON from a local API-shaped payload', () => {
    const output = renderAjnaGithubApiSnapshotFixtureForFile(writeFixtureFile(makeFixture()))

    expect(output).toContain('"repository": "JLPARTIN/SymbolWright"')
    expect(output).toContain('"pullRequestNumber": 67')
    expect(output).toContain('"path": "src/cli-ajna-review-pr-github-api-fixture.ts"')
    expect(output).toContain('"conclusion": "success"')
  })
})
