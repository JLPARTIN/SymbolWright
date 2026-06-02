import { describe, expect, it } from 'vitest'

import { readGithubPullRequestContext } from './github-read-adapter.js'
import type {
  CodemindGithubReadClient,
  GithubPullRequestApiPayload,
  GithubPullRequestFileApiPayload,
} from './github-read-adapter.types.js'

const prPayload: GithubPullRequestApiPayload = {
  number: 9,
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
    ref: 'phase9-reader',
    sha: 'head-sha',
  },
}

const filesPayload: readonly GithubPullRequestFileApiPayload[] = [
  {
    filename: 'src/github/github-read-adapter.ts',
    status: 'added',
    additions: 140,
    deletions: 0,
    patch: '@@ example patch',
  },
  {
    filename: '.github/workflows/ci.yml',
    status: 'modified',
    additions: 3,
    deletions: 1,
  },
]

function makeClient(): CodemindGithubReadClient {
  return {
    async getJson<T>(path: string): Promise<T> {
      if (path.endsWith('/pulls/9')) {
        return prPayload as T
      }

      if (path.endsWith('/pulls/9/files')) {
        return filesPayload as T
      }

      throw new Error(`Unexpected path: ${path}`)
    },
  }
}

describe('GitHub read adapter v0', () => {
  it('maps pull request metadata and files into read-only repo context', async () => {
    const result = await readGithubPullRequestContext(makeClient(), {
      repositoryFullName: 'JLPARTIN/JLPARTIN-CodeMind',
      pullRequestNumber: 9,
    })

    expect(result.readOnly).toBe(true)
    expect(result.context.readOnly).toBe(true)
    expect(result.context.repository.fullName).toBe('JLPARTIN/JLPARTIN-CodeMind')
    expect(result.context.baseRef).toEqual({ name: 'main', sha: 'base-sha' })
    expect(result.context.headRef).toEqual({ name: 'phase9-reader', sha: 'head-sha' })
    expect(result.context.changedFiles).toHaveLength(2)
  })

  it('marks workflow files as protected high-impact changes', async () => {
    const result = await readGithubPullRequestContext(makeClient(), {
      repositoryFullName: 'JLPARTIN/JLPARTIN-CodeMind',
      pullRequestNumber: 9,
    })

    const workflow = result.context.changedFiles.find(
      (file) => file.path === '.github/workflows/ci.yml',
    )

    expect(workflow?.protectedPath).toBe(true)
    expect(workflow?.impactLevel).toBe('HIGH')
    expect(workflow?.changeType).toBe('MODIFIED')
  })

  it('requires owner/repo repository names', async () => {
    await expect(
      readGithubPullRequestContext(makeClient(), {
        repositoryFullName: 'bad-repo-name',
        pullRequestNumber: 9,
      }),
    ).rejects.toThrow('repositoryFullName must use owner/repo format.')
  })
})
