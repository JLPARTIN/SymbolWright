import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import { createAjnaLiveReadRuntimeRegistry } from '../runtime-ajna-live-read-registry.js'
import type { RuntimeToolContext } from '../types.js'

import { renderLiveReadAjnaMergeReadiness, assessLiveReadMergeReadiness } from './live-read-ajna-merge-readiness-pipeline.js'
import { renderLiveReadAjnaReview, runLiveReadAjnaReview } from './live-read-ajna-review-pipeline.js'

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
    { name: 'test', status: 'completed', conclusion: 'success', summary: '' },
  ],
}

const failingCi: GitHubCiEvidence = {
  workflow: 'CI',
  conclusion: 'failure',
  jobs: [
    { name: 'build', status: 'completed', conclusion: 'success', summary: '' },
    { name: 'test', status: 'completed', conclusion: 'failure', summary: 'tests failed' },
  ],
}

const testContext: RuntimeToolContext = {
  cwd: process.cwd(),
  policy: {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    protectedPaths: ['.git', '.env'],
    noisyDirs: ['node_modules', 'dist'],
  },
}

describe('runLiveReadAjnaReview', () => {
  it('returns READY for valid PR and CI evidence', () => {
    const result = runLiveReadAjnaReview({ pr: fakePr, ci: fakeCi })

    expect(result.verdict).toBe('READY')
    expect(result.findings).toHaveLength(0)
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it('returns NEEDS_WORK when no evidence provided', () => {
    const result = runLiveReadAjnaReview({})

    expect(result.verdict).toBe('NEEDS_WORK')
    expect(result.findings).toContain('No evidence provided for review.')
  })

  it('returns NEEDS_WORK for closed unmerged PR', () => {
    const closedPr = { ...fakePr, state: 'closed', merged: false }
    const result = runLiveReadAjnaReview({ pr: closedPr })

    expect(result.verdict).toBe('NEEDS_WORK')
    expect(result.findings).toContain('PR is closed without merge.')
  })

  it('returns NEEDS_WORK for failing CI', () => {
    const result = runLiveReadAjnaReview({ pr: fakePr, ci: failingCi })

    expect(result.verdict).toBe('NEEDS_WORK')
    expect(result.findings.some((f) => f.includes('failure'))).toBe(true)
  })

  it('returns READY for PR-only evidence with open state', () => {
    const result = runLiveReadAjnaReview({ pr: fakePr })

    expect(result.verdict).toBe('READY')
    expect(result.notes).toContain('PR #42: Add widget feature')
  })
})

describe('renderLiveReadAjnaReview', () => {
  it('renders READY verdict output', () => {
    const result = runLiveReadAjnaReview({ pr: fakePr, ci: fakeCi })
    const output = renderLiveReadAjnaReview(result)

    expect(output).toContain('CodeMind Ajna live-read review')
    expect(output).toContain('Verdict: READY')
    expect(output).toContain('Evidence notes:')
    expect(output).toContain('Boundary:')
    expect(output).toContain('- read-only evidence review')
  })

  it('renders NEEDS_WORK with findings', () => {
    const result = runLiveReadAjnaReview({ pr: fakePr, ci: failingCi })
    const output = renderLiveReadAjnaReview(result)

    expect(output).toContain('Verdict: NEEDS_WORK')
    expect(output).toContain('Findings:')
    expect(output).toContain('failure')
  })
})

describe('assessLiveReadMergeReadiness', () => {
  it('returns ready for open PR with passing CI', () => {
    const result = assessLiveReadMergeReadiness({ pr: fakePr, ci: fakeCi })

    expect(result.ready).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.summary).toContain('PR #42: Add widget feature')
  })

  it('blocks for closed PR', () => {
    const closedPr = { ...fakePr, state: 'closed' }
    const result = assessLiveReadMergeReadiness({ pr: closedPr, ci: fakeCi })

    expect(result.ready).toBe(false)
    expect(result.blockers.some((b) => b.includes('closed'))).toBe(true)
  })

  it('blocks for already merged PR', () => {
    const mergedPr = { ...fakePr, merged: true }
    const result = assessLiveReadMergeReadiness({ pr: mergedPr, ci: fakeCi })

    expect(result.ready).toBe(false)
    expect(result.blockers).toContain('PR is already merged.')
  })

  it('blocks for failing CI', () => {
    const result = assessLiveReadMergeReadiness({ pr: fakePr, ci: failingCi })

    expect(result.ready).toBe(false)
    expect(result.blockers.some((b) => b.includes('failure'))).toBe(true)
  })

  it('blocks for failed individual jobs', () => {
    const result = assessLiveReadMergeReadiness({ pr: fakePr, ci: failingCi })

    expect(result.blockers.some((b) => b.includes('Job test'))).toBe(true)
  })

  it('blocks when no CI evidence provided', () => {
    const result = assessLiveReadMergeReadiness({ pr: fakePr })

    expect(result.ready).toBe(false)
    expect(result.blockers).toContain('No CI evidence provided.')
  })
})

describe('renderLiveReadAjnaMergeReadiness', () => {
  it('renders YES for ready PR', () => {
    const result = assessLiveReadMergeReadiness({ pr: fakePr, ci: fakeCi })
    const output = renderLiveReadAjnaMergeReadiness(result)

    expect(output).toContain('CodeMind Ajna live-read merge readiness')
    expect(output).toContain('Ready: YES')
    expect(output).toContain('Summary:')
    expect(output).toContain('Boundary:')
    expect(output).toContain('- no merge is performed')
  })

  it('renders NO with blockers', () => {
    const result = assessLiveReadMergeReadiness({ pr: fakePr, ci: failingCi })
    const output = renderLiveReadAjnaMergeReadiness(result)

    expect(output).toContain('Ready: NO')
    expect(output).toContain('Blockers:')
  })
})

describe('Ajna live-read review tool via registry', () => {
  it('renders review from fake client evidence', async () => {
    const registry = createAjnaLiveReadRuntimeRegistry({ pr: fakePr, ci: fakeCi })
    const tool = registry.getOrThrow('ajna_live_read_review')

    const output = await tool.execute(
      { owner: 'test-owner', repo: 'test-repo', prNumber: 42, workflowRunId: 1001 },
      testContext,
    )

    expect(output).toContain('Verdict: READY')
    expect(output).toContain('read-only evidence review')
  })

  it('handles PR-only review', async () => {
    const registry = createAjnaLiveReadRuntimeRegistry({ pr: fakePr })
    const tool = registry.getOrThrow('ajna_live_read_review')

    const output = await tool.execute(
      { owner: 'test-owner', repo: 'test-repo', prNumber: 42 },
      testContext,
    )

    expect(output).toContain('Verdict: READY')
    expect(output).toContain('PR #42')
  })
})

describe('Ajna live-read merge readiness tool via registry', () => {
  it('renders merge readiness from fake client evidence', async () => {
    const registry = createAjnaLiveReadRuntimeRegistry({ pr: fakePr, ci: fakeCi })
    const tool = registry.getOrThrow('ajna_live_read_merge_readiness')

    const output = await tool.execute(
      { owner: 'test-owner', repo: 'test-repo', prNumber: 42, workflowRunId: 1001 },
      testContext,
    )

    expect(output).toContain('Ready: YES')
    expect(output).toContain('no merge is performed')
  })

  it('blocks when CI fails', async () => {
    const registry = createAjnaLiveReadRuntimeRegistry({ pr: fakePr, ci: failingCi })
    const tool = registry.getOrThrow('ajna_live_read_merge_readiness')

    const output = await tool.execute(
      { owner: 'test-owner', repo: 'test-repo', prNumber: 42, workflowRunId: 1001 },
      testContext,
    )

    expect(output).toContain('Ready: NO')
    expect(output).toContain('Blockers:')
  })
})

describe('CLI integration via fixture file', () => {
  function writeFixture(data: Record<string, unknown>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-ajna-live-'))
    const filePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(filePath, JSON.stringify(data))
    return filePath
  }

  it('renders review mode from fixture file', async () => {
    const { renderRuntimeAjnaLiveRead } = await import('../../cli-runtime-ajna-live-read.js')

    const filePath = writeFixture({
      mode: 'review',
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      workflowRunId: 1001,
      clientData: { pr: fakePr, ci: fakeCi },
    })

    const output = await renderRuntimeAjnaLiveRead(filePath)
    expect(output).toContain('Verdict: READY')
  })

  it('renders merge-readiness mode from fixture file', async () => {
    const { renderRuntimeAjnaLiveRead } = await import('../../cli-runtime-ajna-live-read.js')

    const filePath = writeFixture({
      mode: 'merge-readiness',
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 42,
      workflowRunId: 1001,
      clientData: { pr: fakePr, ci: fakeCi },
    })

    const output = await renderRuntimeAjnaLiveRead(filePath)
    expect(output).toContain('Ready: YES')
  })

  it('rejects invalid mode', async () => {
    const { renderRuntimeAjnaLiveRead } = await import('../../cli-runtime-ajna-live-read.js')

    const filePath = writeFixture({
      mode: 'invalid',
      owner: 'o',
      repo: 'r',
      clientData: {},
    })

    await expect(renderRuntimeAjnaLiveRead(filePath)).rejects.toThrow('mode: "review" or "merge-readiness"')
  })
})
