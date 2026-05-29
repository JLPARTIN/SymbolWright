import { describe, expect, it } from 'vitest';

import {
  buildCodemindRepoContextProofReport,
  CODEMIND_REPO_CONTEXT_PROOF_BLOCK_ID,
  CODEMIND_REPO_CONTEXT_PROOF_PHASE_ID,
  CODEMIND_REPO_CONTEXT_PROOF_PR_ID,
} from './codemind-repo-context-proof.js';
import type { CodemindReadOnlyRepoContext } from '../repo-context/repo-context.types.js';

function makeRepoContext(
  overrides: Partial<CodemindReadOnlyRepoContext> = {},
): CodemindReadOnlyRepoContext {
  return {
    repository: {
      owner: 'jlpartin',
      name: 'codemind',
      fullName: 'jlpartin/codemind',
      defaultBranch: 'main',
    },
    baseRef: { name: 'main' },
    headRef: { name: 'feature-branch' },
    changedFiles: [
      {
        path: 'src/index.ts',
        changeType: 'MODIFIED',
        additions: 10,
        deletions: 2,
        impactLevel: 'MEDIUM',
        protectedPath: false,
        notes: [],
      },
    ],
    diffHunks: [],
    ciEvidence: [{ state: 'PRESENT', provider: 'github-actions', notes: [] }],
    testEvidence: [{ state: 'PRESENT', command: 'npm test', notes: [] }],
    contextGeneratedAt: '2026-05-29T00:00:00.000Z',
    readOnly: true,
    ...overrides,
  };
}

describe('CodeMind Repo Context Proof', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext(),
    });

    expect(report.blockId).toBe(CODEMIND_REPO_CONTEXT_PROOF_BLOCK_ID);
    expect(report.prId).toBe(CODEMIND_REPO_CONTEXT_PROOF_PR_ID);
    expect(report.phaseId).toBe(CODEMIND_REPO_CONTEXT_PROOF_PHASE_ID);
    expect(report.mutationAllowed).toBe(false);
    expect(report.githubWriteAllowed).toBe(false);
    expect(report.providerInvocationAllowed).toBe(false);
  });

  it('returns REPO_CONTEXT_PROOF_READY when CI and test evidence are satisfied', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext(),
    });

    expect(report.status).toBe('REPO_CONTEXT_PROOF_READY');
    expect(report.changedFileCount).toBe(1);
    expect(report.ciEvidenceSatisfied).toBe(true);
    expect(report.testEvidenceSatisfied).toBe(true);
    expect(report.summary).toContain('ready');
  });

  it('returns REPO_CONTEXT_PROOF_PARTIAL when CI evidence is missing', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext({
        ciEvidence: [{ state: 'MISSING', provider: 'github-actions', notes: [] }],
      }),
    });

    expect(report.status).toBe('REPO_CONTEXT_PROOF_PARTIAL');
    expect(report.ciEvidenceSatisfied).toBe(false);
    expect(report.testEvidenceSatisfied).toBe(true);
    expect(report.summary).toContain('partial');
  });

  it('returns REPO_CONTEXT_PROOF_PARTIAL when test evidence is missing', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext({
        testEvidence: [{ state: 'MISSING', notes: [] }],
      }),
    });

    expect(report.status).toBe('REPO_CONTEXT_PROOF_PARTIAL');
    expect(report.testEvidenceSatisfied).toBe(false);
  });

  it('returns REPO_CONTEXT_PROOF_BLOCKED when blocking notes are present', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext(),
      blockingNotes: ['Protected path hit requires operator review.'],
    });

    expect(report.status).toBe('REPO_CONTEXT_PROOF_BLOCKED');
    expect(report.blockingNotes).toEqual([
      'Protected path hit requires operator review.',
    ]);
    expect(report.summary).toContain('blocked');
  });

  it('returns REPO_CONTEXT_PROOF_INVALID when no changed files exist', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext({ changedFiles: [] }),
    });

    expect(report.status).toBe('REPO_CONTEXT_PROOF_INVALID');
    expect(report.changedFileCount).toBe(0);
    expect(report.summary).toContain('invalid');
  });

  it('correctly counts protected files and highest impact level', () => {
    const report = buildCodemindRepoContextProofReport({
      repoContext: makeRepoContext({
        changedFiles: [
          {
            path: 'src/index.ts',
            changeType: 'MODIFIED',
            additions: 5,
            deletions: 1,
            impactLevel: 'HIGH',
            protectedPath: true,
            notes: [],
          },
          {
            path: 'src/utils.ts',
            changeType: 'ADDED',
            additions: 20,
            deletions: 0,
            impactLevel: 'LOW',
            protectedPath: false,
            notes: [],
          },
        ],
      }),
    });

    expect(report.protectedFileCount).toBe(1);
    expect(report.highestImpactLevel).toBe('HIGH');
    expect(report.changedFileCount).toBe(2);
  });

  it('produces a deterministic summary across identical calls', () => {
    const input = { repoContext: makeRepoContext() };
    const r1 = buildCodemindRepoContextProofReport(input);
    const r2 = buildCodemindRepoContextProofReport(input);

    expect(r1.summary).toBe(r2.summary);
    expect(r1.status).toBe(r2.status);
  });
});
