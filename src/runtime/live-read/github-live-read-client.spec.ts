import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import { createGitHubLiveReadRuntimeRegistry } from '../runtime-github-live-read-registry.js'
import type { RuntimeToolContext } from '../types.js'

import { FakeLiveReadClient } from './fake-live-read-client.js'
import type { GitHubHttpClient } from './github-http-client.js'
import { GitHubLiveReadClient } from './github-live-read-client.js'
import { GitHubLiveReadPolicyWrapper } from './github-live-read-policy-wrapper.js'

const fakePr: GitHubPrEvidence = {
  number: 42,
  title: 'Add widget feature',
  state: 'open',
  merged: false,
  base: 'main',
  head: 'feat/widget',
  changedFiles: ['src/widget.ts'],
  additions: 50,
  deletions: 3,
}

const fakeCi: GitHubCiEvidence = {
  workflow: 'CI',
  conclusion: 'success',
  jobs: [
    { name: 'build', status: 'completed', conclusion: 'success', summary: '' },
  ],
}

const testContext: RuntimeToolContext = {
  cwd: process.cwd(),
  policy: {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: ['.git', '.env'],
    noisyDirs: ['node_modules', 'dist'],
  },
}

describe('GitHubLiveReadClient', () => {
  it('has github provider', () => {
    const client = new GitHubLiveReadClient()
    expect(client.provider).toBe('github')
  })

  it('throws not-yet-wired error for PR read', async () => {
    const client = new GitHubLiveReadClient()
    await expect(client.getPullRequestEvidence('owner', 'repo', 1)).rejects.toThrow('not yet wired')
  })

  it('throws not-yet-wired error for workflow read', async () => {
    const client = new GitHubLiveReadClient()
    await expect(client.getWorkflowEvidence('owner', 'repo', 1)).rejects.toThrow('not yet wired')
  })

  it('throws not-yet-wired error for file read', async () => {
    const client = new GitHubLiveReadClient()
    await expect(client.getRepositoryFile('owner', 'repo', 'README.md', 'main')).rejects.toThrow('not yet wired')
  })
})

describe('GitHubLiveReadClient with mock HTTP', () => {
  it('rejects malformed PR response body (string)', async () => {
    const mockHttp: GitHubHttpClient = {
      get: async () => ({ status: 200, body: 'not an object' }),
    }
    const client = new GitHubLiveReadClient(mockHttp)
    await expect(client.getPullRequestEvidence('o', 'r', 1))
      .rejects.toThrow('not an object')
  })

  it('rejects null PR response body', async () => {
    const mockHttp: GitHubHttpClient = {
      get: async () => ({ status: 200, body: null }),
    }
    const client = new GitHubLiveReadClient(mockHttp)
    await expect(client.getPullRequestEvidence('o', 'r', 1))
      .rejects.toThrow('not an object')
  })

  it('extracts PR evidence from valid response', async () => {
    const mockHttp: GitHubHttpClient = {
      get: async (urlPath: string) => {
        if (urlPath.includes('/files')) {
          return { status: 200, body: [{ filename: 'src/index.ts' }] }
        }
        return {
          status: 200,
          body: {
            number: 42,
            title: 'Test PR',
            state: 'open',
            merged: false,
            base: { ref: 'main' },
            head: { ref: 'feature' },
            additions: 10,
            deletions: 5,
          },
        }
      },
    }
    const client = new GitHubLiveReadClient(mockHttp)
    const evidence = await client.getPullRequestEvidence('owner', 'repo', 42)
    expect(evidence.number).toBe(42)
    expect(evidence.title).toBe('Test PR')
    expect(evidence.changedFiles).toEqual(['src/index.ts'])
  })

  it('handles missing base/head gracefully', async () => {
    const mockHttp: GitHubHttpClient = {
      get: async (urlPath: string) => {
        if (urlPath.includes('/files')) {
          return { status: 200, body: [] }
        }
        return {
          status: 200,
          body: { number: 1, title: 'No refs', state: 'open', merged: false },
        }
      },
    }
    const client = new GitHubLiveReadClient(mockHttp)
    const evidence = await client.getPullRequestEvidence('o', 'r', 1)
    expect(evidence.base).toBe('main')
    expect(evidence.head).toBe('unknown')
  })

  it('rejects malformed workflow response body', async () => {
    const mockHttp: GitHubHttpClient = {
      get: async () => ({ status: 200, body: 'bad' }),
    }
    const client = new GitHubLiveReadClient(mockHttp)
    await expect(client.getWorkflowEvidence('o', 'r', 1))
      .rejects.toThrow('not an object')
  })

  it('rejects null file contents response body', async () => {
    const mockHttp: GitHubHttpClient = {
      get: async () => ({ status: 200, body: null }),
    }
    const client = new GitHubLiveReadClient(mockHttp)
    await expect(client.getRepositoryFile('o', 'r', 'f.txt', 'main'))
      .rejects.toThrow('not an object')
  })
})

describe('GitHubLiveReadPolicyWrapper', () => {
  it('delegates PR read through policy check to inner client', async () => {
    const inner = new FakeLiveReadClient({ pr: fakePr })
    const wrapper = new GitHubLiveReadPolicyWrapper(inner)

    const result = await wrapper.getPullRequestEvidence('owner', 'repo', 42)
    expect(result.number).toBe(42)
    expect(result.title).toBe('Add widget feature')
  })

  it('delegates workflow read through policy check to inner client', async () => {
    const inner = new FakeLiveReadClient({ ci: fakeCi })
    const wrapper = new GitHubLiveReadPolicyWrapper(inner)

    const result = await wrapper.getWorkflowEvidence('owner', 'repo', 1)
    expect(result.workflow).toBe('CI')
    expect(result.conclusion).toBe('success')
  })

  it('delegates file read through policy check to inner client', async () => {
    const inner = new FakeLiveReadClient({ files: [{ path: 'README.md', ref: 'main', content: '# Test' }] })
    const wrapper = new GitHubLiveReadPolicyWrapper(inner)

    const result = await wrapper.getRepositoryFile('owner', 'repo', 'README.md', 'main')
    expect(result.content).toBe('# Test')
  })

  it('reports inner provider', () => {
    const inner = new FakeLiveReadClient({})
    const wrapper = new GitHubLiveReadPolicyWrapper(inner)
    expect(wrapper.provider).toBe('fake')
  })

  it('propagates inner client errors after policy passes', async () => {
    const inner = new FakeLiveReadClient({})
    const wrapper = new GitHubLiveReadPolicyWrapper(inner)

    await expect(wrapper.getPullRequestEvidence('o', 'r', 1)).rejects.toThrow('no PR evidence')
  })
})

describe('github live read PR tool', () => {
  it('renders PR evidence through policy-wrapped fake client', async () => {
    const registry = createGitHubLiveReadRuntimeRegistry({ pr: fakePr })
    const tool = registry.getOrThrow('github_live_read_pr')

    const output = await tool.execute(
      { owner: 'test-owner', repo: 'test-repo', prNumber: 42 },
      testContext,
    )

    expect(output).toContain('CodeMind GitHub live read PR')
    expect(output).toContain('Repository: test-owner/test-repo')
    expect(output).toContain('PR #42: Add widget feature')
    expect(output).toContain('Ajna bridge verdict: READY')
    expect(output).toContain('- policy-gated read-only')
  })

  it('rejects missing owner', async () => {
    const registry = createGitHubLiveReadRuntimeRegistry({ pr: fakePr })
    const tool = registry.getOrThrow('github_live_read_pr')

    await expect(tool.execute({ repo: 'r', prNumber: 1 }, testContext)).rejects.toThrow('Missing owner')
  })

  it('rejects missing prNumber', async () => {
    const registry = createGitHubLiveReadRuntimeRegistry({ pr: fakePr })
    const tool = registry.getOrThrow('github_live_read_pr')

    await expect(tool.execute({ owner: 'o', repo: 'r' }, testContext)).rejects.toThrow('Missing or invalid prNumber')
  })
})

describe('github live read CI tool', () => {
  it('renders CI evidence through policy-wrapped fake client', async () => {
    const registry = createGitHubLiveReadRuntimeRegistry({ ci: fakeCi })
    const tool = registry.getOrThrow('github_live_read_ci')

    const output = await tool.execute(
      { owner: 'test-owner', repo: 'test-repo', runId: 1001 },
      testContext,
    )

    expect(output).toContain('CodeMind GitHub live read CI')
    expect(output).toContain('Repository: test-owner/test-repo')
    expect(output).toContain('Workflow CI')
    expect(output).toContain('Ajna bridge verdict: READY')
    expect(output).toContain('- policy-gated read-only')
  })

  it('rejects missing runId', async () => {
    const registry = createGitHubLiveReadRuntimeRegistry({ ci: fakeCi })
    const tool = registry.getOrThrow('github_live_read_ci')

    await expect(tool.execute({ owner: 'o', repo: 'r' }, testContext)).rejects.toThrow('Missing or invalid runId')
  })
})

describe('CLI integration via fixture file', () => {
  function writeFixture(data: Record<string, unknown>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-gh-live-'))
    const filePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(filePath, JSON.stringify(data))
    return filePath
  }

  it('renders PR mode from fixture file', async () => {
    const { renderRuntimeGitHubLiveRead } = await import('../../cli-runtime-github-live-read.js')

    const filePath = writeFixture({
      mode: 'pr',
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      clientData: { pr: fakePr },
    })

    const output = await renderRuntimeGitHubLiveRead(filePath)
    expect(output).toContain('PR #42: Add widget feature')
    expect(output).toContain('Ajna bridge verdict: READY')
  })

  it('renders CI mode from fixture file', async () => {
    const { renderRuntimeGitHubLiveRead } = await import('../../cli-runtime-github-live-read.js')

    const filePath = writeFixture({
      mode: 'ci',
      owner: 'test-owner',
      repo: 'test-repo',
      runId: 1001,
      clientData: { ci: fakeCi },
    })

    const output = await renderRuntimeGitHubLiveRead(filePath)
    expect(output).toContain('Workflow CI')
    expect(output).toContain('Ajna bridge verdict: READY')
  })

  it('rejects invalid mode', async () => {
    const { renderRuntimeGitHubLiveRead } = await import('../../cli-runtime-github-live-read.js')

    const filePath = writeFixture({
      mode: 'invalid',
      owner: 'o',
      repo: 'r',
      clientData: {},
    })

    await expect(renderRuntimeGitHubLiveRead(filePath)).rejects.toThrow('mode: "pr" or "ci"')
  })
})
