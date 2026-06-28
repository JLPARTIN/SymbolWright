import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import { bridgeRuntimeEvidenceToAjna } from '../ajna/runtime-ajna-evidence-bridge.js'
import { buildCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import { buildPrEvidenceSummary } from '../evidence/pr-evidence-builder.js'

import { FakeLiveReadClient } from './fake-live-read-client.js'
import {
  readLiveReadClientFixtureFromFile,
  runLiveReadClientFixture,
  type LiveReadClientFixtureRequest,
} from './live-read-client-fixture.js'
import type { RepositoryFileResult } from './runtime-live-read-client.js'

const fakePr: GitHubPrEvidence = {
  number: 42,
  title: 'Add widget feature',
  state: 'open',
  merged: false,
  base: 'main',
  head: 'feat/widget',
  changedFiles: ['src/widget.ts', 'src/widget.spec.ts'],
  additions: 100,
  deletions: 5,
}

const fakeCi: GitHubCiEvidence = {
  workflow: 'CI',
  conclusion: 'success',
  jobs: [
    { name: 'build', status: 'completed', conclusion: 'success', summary: '' },
    { name: 'test', status: 'completed', conclusion: 'success', summary: '' },
  ],
}

const fakeFile: RepositoryFileResult = {
  path: 'README.md',
  ref: 'main',
  content: '# Test Repository',
}

function writeFixture(request: LiveReadClientFixtureRequest): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-live-read-'))
  const filePath = path.join(dir, 'fixture.json')
  fs.writeFileSync(filePath, JSON.stringify(request))
  return filePath
}

describe('FakeLiveReadClient', () => {
  it('returns configured PR evidence', async () => {
    const client = new FakeLiveReadClient({ pr: fakePr })
    const result = await client.getPullRequestEvidence('owner', 'repo', 42)

    expect(result.number).toBe(42)
    expect(result.title).toBe('Add widget feature')
    expect(result.changedFiles).toEqual(['src/widget.ts', 'src/widget.spec.ts'])
  })

  it('returns configured CI evidence', async () => {
    const client = new FakeLiveReadClient({ ci: fakeCi })
    const result = await client.getWorkflowEvidence('owner', 'repo', 1)

    expect(result.workflow).toBe('CI')
    expect(result.conclusion).toBe('success')
    expect(result.jobs).toHaveLength(2)
  })

  it('returns configured file content', async () => {
    const client = new FakeLiveReadClient({ files: [fakeFile] })
    const result = await client.getRepositoryFile('owner', 'repo', 'README.md', 'main')

    expect(result.content).toBe('# Test Repository')
  })

  it('throws when PR evidence is not configured', async () => {
    const client = new FakeLiveReadClient({})
    await expect(client.getPullRequestEvidence('owner', 'repo', 1)).rejects.toThrow(
      'no PR evidence',
    )
  })

  it('throws when CI evidence is not configured', async () => {
    const client = new FakeLiveReadClient({})
    await expect(client.getWorkflowEvidence('owner', 'repo', 1)).rejects.toThrow('no CI evidence')
  })

  it('throws when file is not configured', async () => {
    const client = new FakeLiveReadClient({})
    await expect(client.getRepositoryFile('owner', 'repo', 'missing.ts', 'main')).rejects.toThrow(
      'no file configured',
    )
  })

  it('reports provider as fake', () => {
    const client = new FakeLiveReadClient({})
    expect(client.provider).toBe('fake')
  })
})

describe('fake client evidence through existing pipeline', () => {
  it('PR evidence passes through buildPrEvidenceSummary', async () => {
    const client = new FakeLiveReadClient({ pr: fakePr })
    const evidence = await client.getPullRequestEvidence('owner', 'repo', 42)
    const summary = buildPrEvidenceSummary(evidence)

    expect(summary.title).toBe('PR #42: Add widget feature')
    expect(summary.lines).toContain('State: open')
    expect(summary.lines).toContain('Changed files: 2')
  })

  it('CI evidence passes through buildCiEvidenceSummary', async () => {
    const client = new FakeLiveReadClient({ ci: fakeCi })
    const evidence = await client.getWorkflowEvidence('owner', 'repo', 1)
    const summary = buildCiEvidenceSummary(evidence)

    expect(summary.title).toBe('Workflow CI')
    expect(summary.lines).toContain('Result: success')
    expect(summary.lines).toContain('Job count: 2')
  })

  it('combined evidence passes through Ajna evidence bridge', async () => {
    const client = new FakeLiveReadClient({ pr: fakePr, ci: fakeCi })
    const prEvidence = await client.getPullRequestEvidence('owner', 'repo', 42)
    const ciEvidence = await client.getWorkflowEvidence('owner', 'repo', 1)

    const ajna = bridgeRuntimeEvidenceToAjna({
      pr: buildPrEvidenceSummary(prEvidence),
      ci: buildCiEvidenceSummary(ciEvidence),
    })

    expect(ajna.verdict).toBe('READY')
    expect(ajna.notes.length).toBeGreaterThan(0)
    expect(ajna.notes).toContain('PR #42: Add widget feature')
    expect(ajna.notes).toContain('Workflow CI')
  })
})

describe('readLiveReadClientFixtureFromFile', () => {
  it('parses a valid fixture file', () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 10,
      clientData: { pr: fakePr },
    }
    const filePath = writeFixture(request)
    const parsed = readLiveReadClientFixtureFromFile(filePath)

    expect(parsed.owner).toBe('test-owner')
    expect(parsed.repo).toBe('test-repo')
    expect(parsed.prNumber).toBe(10)
  })
})

describe('runLiveReadClientFixture', () => {
  it('renders PR evidence from fixture', async () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      clientData: { pr: fakePr },
    }

    const output = await runLiveReadClientFixture(request)

    expect(output).toContain('CodeMind live read client fixture')
    expect(output).toContain('Provider: fake')
    expect(output).toContain('Repository: test-owner/test-repo')
    expect(output).toContain('PR #42: Add widget feature')
    expect(output).toContain('Ajna bridge verdict: READY')
    expect(output).toContain('- fake client only')
  })

  it('renders CI evidence from fixture', async () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      workflowRunId: 1001,
      clientData: { ci: fakeCi },
    }

    const output = await runLiveReadClientFixture(request)

    expect(output).toContain('Workflow CI')
    expect(output).toContain('Result: success')
    expect(output).toContain('Ajna bridge verdict: READY')
  })

  it('renders file content from fixture', async () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      filePath: 'README.md',
      fileRef: 'main',
      clientData: { files: [fakeFile] },
    }

    const output = await runLiveReadClientFixture(request)

    expect(output).toContain('File: README.md (ref: main)')
    expect(output).toContain('Content length: 17 chars')
  })

  it('renders combined PR and CI evidence', async () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      workflowRunId: 1001,
      clientData: { pr: fakePr, ci: fakeCi },
    }

    const output = await runLiveReadClientFixture(request)

    expect(output).toContain('PR #42: Add widget feature')
    expect(output).toContain('Workflow CI')
    expect(output).toContain('Ajna bridge verdict: READY')
  })

  it('includes boundary in output', async () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      clientData: {},
    }

    const output = await runLiveReadClientFixture(request)

    expect(output).toContain('Boundary:')
    expect(output).toContain('- fake client only')
    expect(output).toContain('- no live service call')
    expect(output).toContain('- no comments are posted')
    expect(output).toContain('- no merges are performed')
  })

  it('integrates from file to rendered output', async () => {
    const request: LiveReadClientFixtureRequest = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      clientData: { pr: fakePr },
    }
    const filePath = writeFixture(request)
    const parsed = readLiveReadClientFixtureFromFile(filePath)
    const output = await runLiveReadClientFixture(parsed)

    expect(output).toContain('PR #42: Add widget feature')
    expect(output).toContain('Ajna bridge verdict: READY')
  })
})
