import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildAjnaGithubReadOnlyCollectorFixtureSnapshotForFile,
  parseAjnaGithubReadOnlyCollectorRequest,
  renderAjnaGithubReadOnlyCollectorFixtureForFile,
} from './cli-ajna-github-readonly-collector-fixture.js'
import type { AjnaGithubReadOnlyCollectorPort } from './ajna/ajna-github-readonly-collector-boundary.js'

const tempDirs: string[] = []

function writeRequestFile(input: unknown): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-readonly-collector-'))
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

describe('parseAjnaGithubReadOnlyCollectorRequest', () => {
  it('accepts a local request fixture', () => {
    const request = parseAjnaGithubReadOnlyCollectorRequest(
      JSON.stringify({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 63 }),
    )

    expect(request.repository).toBe('JLPARTIN/SymbolWright')
    expect(request.pullRequestNumber).toBe(63)
  })

  it('rejects invalid request fixtures', () => {
    expect(() => parseAjnaGithubReadOnlyCollectorRequest('[]')).toThrow(
      'request fixture must be an object',
    )
    expect(() =>
      parseAjnaGithubReadOnlyCollectorRequest(
        JSON.stringify({ repository: '', pullRequestNumber: 63 }),
      ),
    ).toThrow('repository must be a non-empty string')
  })
})

describe('buildAjnaGithubReadOnlyCollectorFixtureSnapshotForFile', () => {
  it('collects through an injected fake port', async () => {
    const port: AjnaGithubReadOnlyCollectorPort = {
      collect: async (request) => ({
        pullRequest: {
          repository: request.repository,
          pullRequestNumber: request.pullRequestNumber,
          baseRef: 'main',
          headRef: 'fake-head',
        },
        changedFiles: [{ path: 'src/example.ts', status: 'modified' }],
        checkRuns: [],
      }),
    }

    const snapshot = await buildAjnaGithubReadOnlyCollectorFixtureSnapshotForFile(
      writeRequestFile({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 63 }),
      port,
    )

    expect(snapshot.pullRequest.repository).toBe('JLPARTIN/SymbolWright')
    expect(snapshot.pullRequest.headRef).toBe('fake-head')
    expect(snapshot.changedFiles).toEqual([{ path: 'src/example.ts', status: 'modified' }])
  })
})

describe('renderAjnaGithubReadOnlyCollectorFixtureForFile', () => {
  it('renders a collector snapshot JSON document', async () => {
    const output = await renderAjnaGithubReadOnlyCollectorFixtureForFile(
      writeRequestFile({ repository: 'JLPARTIN/SymbolWright', pullRequestNumber: 63 }),
    )

    expect(output).toContain('"repository": "JLPARTIN/SymbolWright"')
    expect(output).toContain('"pullRequestNumber": 63')
    expect(output).toContain('github-readonly-collector-request.ready.json')
  })
})
