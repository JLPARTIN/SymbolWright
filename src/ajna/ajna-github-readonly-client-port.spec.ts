import { describe, expect, it } from 'vitest'

import { buildAjnaGithubCollectorSnapshotFromApiPayload } from './ajna-github-api-payload-adapter.js'
import {
  collectAjnaGithubApiPayloadFromReadOnlyClient,
  type AjnaGithubReadOnlyClientPort,
} from './ajna-github-readonly-client-port.js'

describe('collectAjnaGithubApiPayloadFromReadOnlyClient', () => {
  it('collects local payload data through an injected read-only client port', async () => {
    const calls: string[] = []
    const port: AjnaGithubReadOnlyClientPort = {
      getPullRequest: async (request) => {
        calls.push(`pull:${request.repository}#${request.pullRequestNumber}`)
        return {
          repository: request.repository,
          number: request.pullRequestNumber,
          base: { ref: 'main' },
          head: {
            ref: 'ajna-offline-snapshot-cli-bundle',
            sha: 'a00217e91f8404384335d39ade7f54ff58317844',
          },
        }
      },
      listPullRequestFiles: async (request) => {
        calls.push(`files:${request.repository}#${request.pullRequestNumber}`)
        return [{ filename: 'src/cli-ajna-github-api-snapshot-fixture.ts', status: 'added' }]
      },
      listCheckRunsForRef: async (request) => {
        calls.push(`checks:${request.repository}@${request.ref}`)
        return [{ name: 'Validate SymbolWright', status: 'completed', conclusion: 'success' }]
      },
    }

    const payload = await collectAjnaGithubApiPayloadFromReadOnlyClient(port, {
      repository: 'JLPARTIN/SymbolWright',
      pullRequestNumber: 68,
    })

    expect(payload.pullRequest.repository).toBe('JLPARTIN/SymbolWright')
    expect(payload.files).toEqual([
      { filename: 'src/cli-ajna-github-api-snapshot-fixture.ts', status: 'added' },
    ])
    expect(payload.checkRuns?.[0]?.conclusion).toBe('success')
    expect(calls).toEqual([
      'pull:JLPARTIN/SymbolWright#68',
      'files:JLPARTIN/SymbolWright#68',
      'checks:JLPARTIN/SymbolWright@a00217e91f8404384335d39ade7f54ff58317844',
    ])
  })

  it('feeds the existing offline API payload adapter', async () => {
    const port: AjnaGithubReadOnlyClientPort = {
      getPullRequest: async (request) => ({
        repository: request.repository,
        number: request.pullRequestNumber,
        base: { ref: 'main' },
        head: { ref: 'fixture-head' },
      }),
      listPullRequestFiles: async () => [{ filename: 'src/example.ts', status: 'modified' }],
      listCheckRunsForRef: async () => [],
    }

    const payload = await collectAjnaGithubApiPayloadFromReadOnlyClient(port, {
      repository: 'JLPARTIN/SymbolWright',
      pullRequestNumber: 68,
    })
    const snapshot = buildAjnaGithubCollectorSnapshotFromApiPayload(payload)

    expect(snapshot.pullRequest.headRef).toBe('fixture-head')
    expect(snapshot.changedFiles).toEqual([{ path: 'src/example.ts', status: 'modified' }])
  })

  it('rejects invalid collection requests before calling the port', async () => {
    const port: AjnaGithubReadOnlyClientPort = {
      getPullRequest: async () => {
        throw new Error('should not call getPullRequest')
      },
      listPullRequestFiles: async () => [],
      listCheckRunsForRef: async () => [],
    }

    await expect(
      collectAjnaGithubApiPayloadFromReadOnlyClient(port, {
        repository: '',
        pullRequestNumber: 68,
      }),
    ).rejects.toThrow('repository must be a non-empty string')
  })
})
