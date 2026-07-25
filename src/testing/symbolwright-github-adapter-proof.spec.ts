import { describe, expect, it } from 'vitest'

import {
  buildSymbolWrightGithubAdapterProofReport,
  SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_BLOCK_ID,
  SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PHASE_ID,
  SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PR_ID,
} from './symbolwright-github-adapter-proof.js'
import type { SymbolWrightGithubPullRequestIdentity } from '../github/github-pr-context.types.js'
import type { SymbolWrightReadOnlyRepoContext } from '../repo-context/repo-context.types.js'

const PR_IDENTITY: SymbolWrightGithubPullRequestIdentity = {
  repositoryFullName: 'jlpartin/symbolwright',
  pullRequestNumber: 42,
  baseRef: 'main',
  headRef: 'feature-branch',
}

const REPO_CONTEXT: SymbolWrightReadOnlyRepoContext = {
  repository: {
    owner: 'jlpartin',
    name: 'symbolwright',
    fullName: 'jlpartin/symbolwright',
    defaultBranch: 'main',
  },
  baseRef: { name: 'main' },
  headRef: { name: 'feature-branch' },
  changedFiles: [
    {
      path: 'src/index.ts',
      changeType: 'MODIFIED',
      additions: 5,
      deletions: 1,
      impactLevel: 'LOW',
      protectedPath: false,
      notes: [],
    },
  ],
  diffHunks: [],
  ciEvidence: [{ state: 'PRESENT', provider: 'github-actions', notes: [] }],
  testEvidence: [{ state: 'PRESENT', command: 'npm test', notes: [] }],
  contextGeneratedAt: '2026-05-29T00:00:00.000Z',
  readOnly: true,
}

describe('SymbolWright GitHub Adapter Proof', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const report = buildSymbolWrightGithubAdapterProofReport({
      adapterMode: 'READ_ONLY_CONTRACT',
      pullRequest: PR_IDENTITY,
      repoContext: REPO_CONTEXT,
    })

    expect(report.blockId).toBe(SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_BLOCK_ID)
    expect(report.prId).toBe(SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PR_ID)
    expect(report.phaseId).toBe(SYMBOLWRIGHT_GITHUB_ADAPTER_PROOF_PHASE_ID)
    expect(report.mutationAllowed).toBe(false)
    expect(report.githubWriteAllowed).toBe(false)
    expect(report.providerInvocationAllowed).toBe(false)
  })

  it('returns GITHUB_ADAPTER_PROOF_READY for a read-only contract request', () => {
    const report = buildSymbolWrightGithubAdapterProofReport({
      adapterMode: 'READ_ONLY_CONTRACT',
      pullRequest: PR_IDENTITY,
      repoContext: REPO_CONTEXT,
    })

    expect(report.status).toBe('GITHUB_ADAPTER_PROOF_READY')
    expect(report.isReadOnly).toBe(true)
    expect(report.violations).toEqual([])
    expect(report.summary).toContain('ready')
  })

  it('returns GITHUB_ADAPTER_PROOF_INVALID for a non-read-only adapter mode', () => {
    const report = buildSymbolWrightGithubAdapterProofReport({
      adapterMode: 'READ_ONLY_RUNTIME_FUTURE',
      pullRequest: PR_IDENTITY,
      repoContext: REPO_CONTEXT,
    })

    expect(report.status).toBe('GITHUB_ADAPTER_PROOF_INVALID')
    expect(report.violations.some((v) => v.includes('READ_ONLY_RUNTIME_FUTURE'))).toBe(true)
    expect(report.summary).toContain('invalid')
  })

  it('returns GITHUB_ADAPTER_PROOF_INVALID when PR identity is incomplete', () => {
    const report = buildSymbolWrightGithubAdapterProofReport({
      adapterMode: 'READ_ONLY_CONTRACT',
      pullRequest: {
        repositoryFullName: '',
        pullRequestNumber: 0,
        baseRef: 'main',
        headRef: 'feature',
      },
      repoContext: REPO_CONTEXT,
    })

    expect(report.status).toBe('GITHUB_ADAPTER_PROOF_INVALID')
    expect(report.violations.some((v) => v.includes('identity'))).toBe(true)
  })

  it('returns GITHUB_ADAPTER_PROOF_BLOCKED when blocking notes are present', () => {
    const report = buildSymbolWrightGithubAdapterProofReport({
      adapterMode: 'READ_ONLY_CONTRACT',
      pullRequest: PR_IDENTITY,
      repoContext: REPO_CONTEXT,
      blockingNotes: ['GitHub adapter under security review.'],
    })

    expect(report.status).toBe('GITHUB_ADAPTER_PROOF_BLOCKED')
    expect(report.blockingNotes).toEqual(['GitHub adapter under security review.'])
    expect(report.summary).toContain('blocked')
  })

  it('confirms no write flags appear in the adapter response', () => {
    const report = buildSymbolWrightGithubAdapterProofReport({
      adapterMode: 'READ_ONLY_CONTRACT',
      pullRequest: PR_IDENTITY,
      repoContext: REPO_CONTEXT,
    })

    expect(report.isReadOnly).toBe(true)
    expect(report.githubWriteAllowed).toBe(false)
    expect(report.mutationAllowed).toBe(false)
  })

  it('produces a deterministic summary across identical calls', () => {
    const input = {
      adapterMode: 'READ_ONLY_CONTRACT' as const,
      pullRequest: PR_IDENTITY,
      repoContext: REPO_CONTEXT,
    }
    const r1 = buildSymbolWrightGithubAdapterProofReport(input)
    const r2 = buildSymbolWrightGithubAdapterProofReport(input)

    expect(r1.summary).toBe(r2.summary)
    expect(r1.status).toBe(r2.status)
  })
})
