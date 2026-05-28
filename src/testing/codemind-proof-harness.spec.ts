import { describe, expect, it } from 'vitest';

import {
  buildCodemindProofHarnessReport,
  CODEMIND_PROOF_HARNESS_BLOCK_ID,
  CODEMIND_PROOF_HARNESS_PHASE_ID,
  CODEMIND_PROOF_HARNESS_PR_ID,
} from './codemind-proof-harness.js';

describe('CodeMind Proof Harness', () => {
  it('emits canonical metadata and keeps runtime mutation disabled', () => {
    const report = buildCodemindProofHarnessReport([
      {
        domain: 'FOUNDATION',
        requiredSpecs: ['src/codemind-foundation.spec.ts'],
        existingSpecs: ['src/codemind-foundation.spec.ts'],
      },
    ]);

    expect(report.blockId).toBe(CODEMIND_PROOF_HARNESS_BLOCK_ID);
    expect(report.prId).toBe(CODEMIND_PROOF_HARNESS_PR_ID);
    expect(report.phaseId).toBe(CODEMIND_PROOF_HARNESS_PHASE_ID);
    expect(report.testCommand).toBe('npm test');
    expect(report.typecheckCommand).toBe('npm run typecheck');
    expect(report.buildCommand).toBe('npm run build');
    expect(report.mutationAllowed).toBe(false);
    expect(report.githubWriteAllowed).toBe(false);
    expect(report.providerInvocationAllowed).toBe(false);
  });

  it('marks a domain covered when every required spec exists', () => {
    const report = buildCodemindProofHarnessReport([
      {
        domain: 'AJNA_REVIEW_CORTEX',
        requiredSpecs: [
          'src/ajna/ajna-merge-readiness.spec.ts',
          'src/ajna/ajna-review-renderer.spec.ts',
        ],
        existingSpecs: [
          'src/ajna/ajna-review-renderer.spec.ts',
          'src/ajna/ajna-merge-readiness.spec.ts',
        ],
      },
    ]);

    expect(report.domains[0]).toMatchObject({
      domain: 'AJNA_REVIEW_CORTEX',
      state: 'COVERED',
      missingSpecs: [],
    });
    expect(report.mergeReady).toBe(true);
    expect(report.summary).toBe('1/1 proof domains covered.');
  });

  it('marks a domain partial when only some required specs exist', () => {
    const report = buildCodemindProofHarnessReport([
      {
        domain: 'AGENT_KERNEL',
        requiredSpecs: [
          'src/kernel/agent-kernel-planner.spec.ts',
          'src/kernel/agent-kernel-trace-replay.spec.ts',
        ],
        existingSpecs: ['src/kernel/agent-kernel-planner.spec.ts'],
      },
    ]);

    expect(report.domains[0]).toMatchObject({
      domain: 'AGENT_KERNEL',
      state: 'PARTIAL',
      missingSpecs: ['src/kernel/agent-kernel-trace-replay.spec.ts'],
    });
    expect(report.mergeReady).toBe(false);
  });

  it('marks a domain blocked when blocking notes are present', () => {
    const report = buildCodemindProofHarnessReport([
      {
        domain: 'GITHUB_ADAPTERS',
        requiredSpecs: ['src/github/github-comment-adapter.spec.ts'],
        existingSpecs: ['src/github/github-comment-adapter.spec.ts'],
        blockingNotes: ['GitHub writes require operator approval before live mutation tests.'],
      },
    ]);

    expect(report.domains[0]).toMatchObject({
      domain: 'GITHUB_ADAPTERS',
      state: 'BLOCKED',
      missingSpecs: [],
      blockingNotes: ['GitHub writes require operator approval before live mutation tests.'],
    });
    expect(report.mergeReady).toBe(false);
  });

  it('sorts and deduplicates spec paths for deterministic reports', () => {
    const report = buildCodemindProofHarnessReport([
      {
        domain: 'REPO_CONTEXT',
        requiredSpecs: [
          'src/repo-context/repo-context-summary.spec.ts',
          'src/repo-context/repo-context-summary.spec.ts',
          'src/repo-context/repo-context.types.spec.ts',
        ],
        existingSpecs: [
          'src/repo-context/repo-context.types.spec.ts',
          'src/repo-context/repo-context-summary.spec.ts',
          'src/repo-context/repo-context-summary.spec.ts',
        ],
      },
    ]);

    expect(report.domains[0]?.requiredSpecs).toEqual([
      'src/repo-context/repo-context-summary.spec.ts',
      'src/repo-context/repo-context.types.spec.ts',
    ]);
    expect(report.domains[0]?.existingSpecs).toEqual([
      'src/repo-context/repo-context-summary.spec.ts',
      'src/repo-context/repo-context.types.spec.ts',
    ]);
  });
});
