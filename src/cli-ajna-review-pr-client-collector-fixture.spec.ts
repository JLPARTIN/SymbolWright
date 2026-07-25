import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { AjnaGithubReadOnlyClientPort } from './ajna/ajna-github-readonly-client-port.js'
import { renderAjnaReviewPrClientCollectorFixtureForFile } from './cli-ajna-review-pr-client-collector-fixture.js'

const tempDirs: string[] = []

function writeRequestFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-client-review-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'request.json')
  writeFileSync(inputPath, JSON.stringify(input), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('renderAjnaReviewPrClientCollectorFixtureForFile', () => {
  it('renders an Ajna review report through the default fake client bridge', async () => {
    const output = await renderAjnaReviewPrClientCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 71 }),
    )

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('fixture-client-pr-71')
    expect(output).toContain('GitHub diff evidence captured')
    expect(output).toContain('GitHub CI evidence captured')
    expect(output).toContain('Fixture Validate SymbolWright')
  })

  it('accepts an injected fake client', async () => {
    const client: AjnaGithubReadOnlyClientPort = {
      getPullRequest: async (request) => ({
        repository: request.repository,
        number: request.pullRequestNumber,
        base: { ref: 'main' },
        head: { ref: 'custom-review-head' },
      }),
      listPullRequestFiles: async () => [{ filename: 'src/custom-review.ts', status: 'added' }],
      listCheckRunsForRef: async () => [],
    }

    const output = await renderAjnaReviewPrClientCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 72 }),
      client,
    )

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('custom-review-head')
    expect(output).toContain('- src/custom-review.ts')
  })
})
