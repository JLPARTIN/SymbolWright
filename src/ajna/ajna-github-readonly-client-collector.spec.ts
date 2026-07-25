import { describe, expect, it } from 'vitest'

import type { AjnaGithubReadOnlyClientPort } from './ajna-github-readonly-client-port.js'
import {
  collectAjnaGithubSnapshotFromReadOnlyClient,
  createAjnaGithubReadOnlyClientCollectorPort,
} from './ajna-github-readonly-client-collector.js'

function makeClient(): AjnaGithubReadOnlyClientPort {
  return {
    getPullRequest: async (request) => ({
      repository: request.repository,
      number: request.pullRequestNumber,
      base: { ref: 'main' },
      head: { ref: 'ajna-client-port-bundle', sha: '03e51627397d79e8b4b3b04d745e5606f2a3a373' },
    }),
    listPullRequestFiles: async () => [
      {
        filename: 'src/ajna/ajna-github-readonly-client-port.ts',
        status: 'added',
        additions: 40,
        deletions: 0,
      },
    ],
    listCheckRunsForRef: async () => [
      {
        name: 'Validate SymbolWright',
        status: 'completed',
        conclusion: 'success',
      },
    ],
  }
}

describe('collectAjnaGithubSnapshotFromReadOnlyClient', () => {
  it('returns a collector snapshot from an injected read-only client', async () => {
    const snapshot = await collectAjnaGithubSnapshotFromReadOnlyClient(makeClient(), {
      repository: 'JLPARTIN/SymbolWright',
      pullRequestNumber: 69,
    })

    expect(snapshot.pullRequest.repository).toBe('JLPARTIN/SymbolWright')
    expect(snapshot.pullRequest.pullRequestNumber).toBe(69)
    expect(snapshot.pullRequest.headRef).toBe('ajna-client-port-bundle')
    expect(snapshot.changedFiles).toEqual([
      {
        path: 'src/ajna/ajna-github-readonly-client-port.ts',
        status: 'added',
        additions: 40,
        deletions: 0,
      },
    ])
    expect(snapshot.checkRuns).toEqual([
      {
        name: 'Validate SymbolWright',
        status: 'completed',
        conclusion: 'success',
      },
    ])
  })
})

describe('createAjnaGithubReadOnlyClientCollectorPort', () => {
  it('adapts the injected client into the collector port interface', async () => {
    const port = createAjnaGithubReadOnlyClientCollectorPort(makeClient())
    const snapshot = await port.collect({
      repository: 'JLPARTIN/SymbolWright',
      pullRequestNumber: 69,
    })

    expect(snapshot.changedFiles.map((file) => file.path)).toEqual([
      'src/ajna/ajna-github-readonly-client-port.ts',
    ])
  })

  it('preserves request validation through the existing client payload boundary', async () => {
    const port = createAjnaGithubReadOnlyClientCollectorPort(makeClient())

    await expect(
      port.collect({
        repository: '',
        pullRequestNumber: 69,
      }),
    ).rejects.toThrow('repository must be a non-empty string')
  })
})
