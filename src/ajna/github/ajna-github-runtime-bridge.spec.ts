import { describe, expect, it } from 'vitest'

import {
  buildAjnaReviewRequestFromGithubPr,
  mapGithubContextToAjnaReviewRequest,
} from './ajna-github-runtime-bridge.js'
import type {
  CodemindGithubReadAdapterResult,
  CodemindGithubReadClient,
  GithubPullRequestApiPayload,
  GithubPullRequestFileApiPayload,
} from '../../github/github-read-adapter.types.js'

const prPayload: GithubPullRequestApiPayload = {
  number: 10,
  base: {
    ref: 'main',
    sha: 'base-sha',
    repo: {
      default_branch: 'main',
      full_name: 'JLPARTIN/JLPARTIN-CodeMind',
      name: 'JLPARTIN-CodeMind',
      owner: {
        login: 'JLPARTIN',
      },
    },
  },
  head: {
    ref: 'pr10-ajna-github-runtime-bridge',
    sha: 'head-sha',
  },
}

const filesPayload: readonly GithubPullRequestFileApiPayload[] = [
  {
    filename: 'src/ajna/github/ajna-github-runtime-bridge.ts',
    status: 'added',
    additions: 120,
    deletions: 0,
    patch: '@@ bridge patch',
  },
  {
    filename: 'docs/codemind/ajna/CODEMIND_AJNA_BUILD_PLAN.md',
    status: 'modified',
    additions: 4,
    deletions: 1,
  },
]

function makeClient(): CodemindGithubReadClient {
  return {
    async getJson<T>(path: string): Promise<T> {
      if (path.endsWith('/pulls/10')) {
        return prPayload as unknown as T
      }

      if (path.endsWith('/pulls/10/files')) {
        return filesPayload as unknown as T
      }

      throw new Error(`Unexpected path: ${path}`)
    },
  }
}

function makeGithubContext(): CodemindGithubReadAdapterResult {
  return {
    target: {
      repositoryFullName: 'JLPARTIN/JLPARTIN-CodeMind',
      pullRequestNumber: 10,
    },
    context: {
      repository: {
        owner: 'JLPARTIN',
        name: 'JLPARTIN-CodeMind',
        fullName: 'JLPARTIN/JLPARTIN-CodeMind',
        defaultBranch: 'main',
      },
      baseRef: {
        name: 'main',
        sha: 'base-sha',
      },
      headRef: {
        name: 'pr10-ajna-github-runtime-bridge',
        sha: 'head-sha',
      },
      changedFiles: [
        {
          path: 'src/ajna/github/ajna-github-runtime-bridge.ts',
          changeType: 'ADDED',
          additions: 120,
          deletions: 0,
          impactLevel: 'MEDIUM',
          protectedPath: false,
          notes: ['Patch summary available.'],
        },
      ],
      diffHunks: [],
      ciEvidence: [],
      testEvidence: [],
      contextGeneratedAt: '2026-05-28T00:00:00.000Z',
      readOnly: true,
    },
    readOnly: true,
    notes: [],
  }
}

describe('Ajna GitHub runtime bridge', () => {
  it('maps GitHub read context into an Ajna review request', () => {
    const ajnaRequest = mapGithubContextToAjnaReviewRequest('ajna-github-10', makeGithubContext(), {
      operatorIntent: 'Review the live GitHub PR context.',
      requireCiEvidence: true,
      requireTestEvidence: true,
    })

    expect(ajnaRequest.requestId).toBe('ajna-github-10')
    expect(ajnaRequest.subject.repository).toBe('JLPARTIN/JLPARTIN-CodeMind')
    expect(ajnaRequest.subject.pullRequestNumber).toBe(10)
    expect(ajnaRequest.subject.baseRef).toBe('main')
    expect(ajnaRequest.subject.headRef).toBe('pr10-ajna-github-runtime-bridge')
    expect(ajnaRequest.subject.commitSha).toBe('head-sha')
    expect(ajnaRequest.changedFiles).toEqual(['src/ajna/github/ajna-github-runtime-bridge.ts'])
    expect(ajnaRequest.operatorIntent).toBe('Review the live GitHub PR context.')
  })

  it('passes approved GitHub PR reads through the runtime boundary', async () => {
    const result = await buildAjnaReviewRequestFromGithubPr(makeClient(), {
      requestId: 'ajna-github-10',
      sessionId: 'session-10',
      target: {
        repositoryFullName: 'JLPARTIN/JLPARTIN-CodeMind',
        pullRequestNumber: 10,
      },
      operatorApproved: true,
      requireCiEvidence: false,
      requireTestEvidence: false,
    })

    expect(result.runtimeDecision.allowedToRun).toBe(true)
    expect(result.githubContext.context.readOnly).toBe(true)
    expect(result.ajnaReviewRequest.subject.repository).toBe('JLPARTIN/JLPARTIN-CodeMind')
    expect(result.ajnaReviewRequest.changedFiles).toHaveLength(2)
  })

  it('blocks unapproved GitHub PR reads at the runtime boundary', async () => {
    await expect(
      buildAjnaReviewRequestFromGithubPr(makeClient(), {
        requestId: 'ajna-github-10',
        sessionId: 'session-10',
        target: {
          repositoryFullName: 'JLPARTIN/JLPARTIN-CodeMind',
          pullRequestNumber: 10,
        },
        operatorApproved: false,
        requireCiEvidence: false,
        requireTestEvidence: false,
      }),
    ).rejects.toThrow('GitHub PR read adapter did not pass the CodeMind runtime boundary.')
  })
})
