import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { AjnaGithubReadOnlyCollectorPort } from './ajna/ajna-github-readonly-collector-boundary.js'
import {
  parseAjnaReadOnlyCollectorReviewRequest,
  renderAjnaReviewPrReadOnlyCollectorFixtureForFile,
} from './cli-ajna-review-pr-readonly-collector-fixture.js'

const tempDirs: string[] = []

function writeRequestFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-readonly-review-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'collector-request.json')
  writeFileSync(inputPath, JSON.stringify(input), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseAjnaReadOnlyCollectorReviewRequest', () => {
  it('accepts a local request fixture', () => {
    const request = parseAjnaReadOnlyCollectorReviewRequest(
      JSON.stringify({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 64 }),
    )

    expect(request.repository).toBe('JLPARTIN/SymbolWright')
    expect(request.pullRequestNumber).toBe(64)
  })

  it('rejects invalid request fixtures', () => {
    expect(() => parseAjnaReadOnlyCollectorReviewRequest('[]')).toThrow(
      'review request must be an object',
    )
    expect(() =>
      parseAjnaReadOnlyCollectorReviewRequest(
        JSON.stringify({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 0 }),
      ),
    ).toThrow('pullRequestNumber must be a positive integer')
  })
})

describe('renderAjnaReviewPrReadOnlyCollectorFixtureForFile', () => {
  it('renders the default fake collector output through Ajna review-pr', async () => {
    const output = await renderAjnaReviewPrReadOnlyCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 64 }),
    )

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('GitHub diff evidence captured')
    expect(output).toContain('GitHub CI evidence captured')
    expect(output).toContain('Fixture Validate SymbolWright')
  })

  it('accepts an injected fake collector port', async () => {
    const port: AjnaGithubReadOnlyCollectorPort = {
      collect: async (request) => ({
        pullRequest: {
          repository: request.repository,
          pullRequestNumber: request.pullRequestNumber,
          baseRef: 'main',
          headRef: 'custom-fixture-head',
        },
        changedFiles: [{ path: 'src/custom-fixture.ts', status: 'added' }],
        checkRuns: [],
      }),
    }

    const output = await renderAjnaReviewPrReadOnlyCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 65 }),
      port,
    )

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('- src/custom-fixture.ts')
    expect(output).toContain('custom-fixture-head')
  })
})
