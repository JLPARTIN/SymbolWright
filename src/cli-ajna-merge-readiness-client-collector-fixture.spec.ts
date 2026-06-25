import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { AjnaGithubReadOnlyClientPort } from './ajna/ajna-github-readonly-client-port.js'
import { renderAjnaMergeReadinessClientCollectorFixtureForFile } from './cli-ajna-merge-readiness-client-collector-fixture.js'

const tempDirs: string[] = []

function writeRequestFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'codemind-ajna-client-readiness-'))
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

describe('renderAjnaMergeReadinessClientCollectorFixtureForFile', () => {
  it('renders merge-readiness through the default fake client bridge', async () => {
    const output = await renderAjnaMergeReadinessClientCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/CodeMind', pullRequestNumber: 72 }),
    )

    expect(output).toContain('Ajna merge-readiness')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Required evidence present: no')
    expect(output).toContain('Operator decision required: no')
    expect(output).toContain('Blocking finding IDs: None')
    expect(output).toContain('Mode: READ_ONLY')
  })

  it('accepts an injected fake client', async () => {
    const client: AjnaGithubReadOnlyClientPort = {
      getPullRequest: async (request) => ({
        repository: request.repository,
        number: request.pullRequestNumber,
        base: { ref: 'main' },
        head: { ref: 'readiness-head' },
      }),
      listPullRequestFiles: async () => [{ filename: 'src/readiness.ts', status: 'modified' }],
      listCheckRunsForRef: async () => [],
    }

    const output = await renderAjnaMergeReadinessClientCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/CodeMind', pullRequestNumber: 73 }),
      client,
    )

    expect(output).toContain('Ajna merge-readiness')
    expect(output).toContain('Status: READY')
    expect(output).toContain('Blocking finding IDs: None')
  })

  it('rejects invalid request JSON before rendering', async () => {
    await expect(
      renderAjnaMergeReadinessClientCollectorFixtureForFile(
        writeRequestFile({ repository: '', pullRequestNumber: 72 }),
      ),
    ).rejects.toThrow('repository must be a non-empty string')
  })
})
