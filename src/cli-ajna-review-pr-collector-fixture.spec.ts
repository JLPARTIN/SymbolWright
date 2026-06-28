import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  parseAjnaGithubCollectorFixture,
  renderAjnaReviewPrCollectorFixtureForFile,
} from './cli-ajna-review-pr-collector-fixture.js'
import type { AjnaGithubCollectorSnapshot } from './ajna/ajna-github-collector-contract.js'

const tempDirs: string[] = []

function makeSnapshot(
  overrides: Partial<AjnaGithubCollectorSnapshot> = {},
): AjnaGithubCollectorSnapshot {
  return {
    pullRequest: {
      repository: 'JLPARTIN/CodeMind',
      pullRequestNumber: 61,
      baseRef: 'main',
      headRef: 'ajna-github-collector-contract-bundle',
      headSha: 'ec6ce338f28a3c15d2c75e64c1c4de6d04419445',
    },
    changedFiles: [
      {
        path: 'src/ajna/ajna-github-collector-contract.ts',
        status: 'added',
        additions: 80,
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
    ...overrides,
  }
}

function writeSnapshotFile(snapshot: AjnaGithubCollectorSnapshot): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'codemind-ajna-collector-fixture-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'collector-snapshot.json')
  writeFileSync(inputPath, JSON.stringify(snapshot), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseAjnaGithubCollectorFixture', () => {
  it('accepts collector snapshot fixture JSON', () => {
    const snapshot = parseAjnaGithubCollectorFixture(JSON.stringify(makeSnapshot()))

    expect(snapshot.pullRequest.repository).toBe('JLPARTIN/CodeMind')
    expect(snapshot.pullRequest.pullRequestNumber).toBe(61)
  })

  it('rejects non-object fixture JSON', () => {
    expect(() => parseAjnaGithubCollectorFixture('[]')).toThrow(
      'collector fixture must be an object',
    )
  })
})

describe('renderAjnaReviewPrCollectorFixtureForFile', () => {
  it('renders a local collector snapshot through Ajna review-pr', () => {
    const output = renderAjnaReviewPrCollectorFixtureForFile(writeSnapshotFile(makeSnapshot()))

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('GitHub diff evidence captured')
    expect(output).toContain('GitHub CI evidence captured')
  })

  it('renders a local collector snapshot without check runs', () => {
    const source = makeSnapshot()
    const snapshotWithoutChecks: AjnaGithubCollectorSnapshot = {
      pullRequest: source.pullRequest,
      changedFiles: source.changedFiles,
    }
    const output = renderAjnaReviewPrCollectorFixtureForFile(
      writeSnapshotFile(snapshotWithoutChecks),
    )

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('- src/ajna/ajna-github-collector-contract.ts')
  })
})
