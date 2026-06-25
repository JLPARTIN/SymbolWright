import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import type { AjnaGithubReadOnlyClientPort } from './ajna/ajna-github-readonly-client-port.js'
import {
  parseAjnaClientCollectorFixtureRequest,
  renderAjnaClientCollectorFixtureForFile,
} from './cli-ajna-client-collector-fixture.js'

const tempDirs: string[] = []

function writeRequestFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'codemind-ajna-client-collector-'))
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

describe('parseAjnaClientCollectorFixtureRequest', () => {
  it('accepts a local request object', () => {
    const request = parseAjnaClientCollectorFixtureRequest(
      JSON.stringify({ repository: 'JLPARTIN/CodeMind', pullRequestNumber: 70 }),
    )

    expect(request.repository).toBe('JLPARTIN/CodeMind')
    expect(request.pullRequestNumber).toBe(70)
  })

  it('rejects invalid request JSON', () => {
    expect(() => parseAjnaClientCollectorFixtureRequest('[]')).toThrow('fixture request must be an object')
    expect(() =>
      parseAjnaClientCollectorFixtureRequest(JSON.stringify({ repository: '', pullRequestNumber: 70 })),
    ).toThrow('repository must be a non-empty string')
  })
})

describe('renderAjnaClientCollectorFixtureForFile', () => {
  it('renders a collector snapshot JSON document from the default fake client', async () => {
    const output = await renderAjnaClientCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/CodeMind', pullRequestNumber: 70 }),
    )

    expect(output).toContain('"repository": "JLPARTIN/CodeMind"')
    expect(output).toContain('"pullRequestNumber": 70')
    expect(output).toContain('fixture-client-pr-70')
    expect(output).toContain('Fixture Validate CodeMind')
  })

  it('accepts an injected fake client', async () => {
    const client: AjnaGithubReadOnlyClientPort = {
      getPullRequest: async (request) => ({
        repository: request.repository,
        number: request.pullRequestNumber,
        base: { ref: 'main' },
        head: { ref: 'custom-client-head' },
      }),
      listPullRequestFiles: async () => [{ filename: 'src/custom-client.ts', status: 'added' }],
      listCheckRunsForRef: async () => [],
    }

    const output = await renderAjnaClientCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/CodeMind', pullRequestNumber: 71 }),
      client,
    )

    expect(output).toContain('custom-client-head')
    expect(output).toContain('"path": "src/custom-client.ts"')
    expect(output).toContain('"status": "added"')
  })
})
