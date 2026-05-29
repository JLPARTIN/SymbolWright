# PR-CM-TEST-04: Repo Context Proof

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-04
PR-CM-TEST-04
CODEMIND-TEST-04
```

## Purpose

Validate CodeMind's repo-awareness layer. CodeMind should know the repo, not just the diff.

## Statuses

```
REPO_CONTEXT_PROOF_READY    — changed files present, CI and test evidence satisfied
REPO_CONTEXT_PROOF_PARTIAL  — changed files present, evidence incomplete
REPO_CONTEXT_PROOF_BLOCKED  — blocking notes present
REPO_CONTEXT_PROOF_INVALID  — no changed files in context
```

## Core exports

```ts
CODEMIND_REPO_CONTEXT_PROOF_BLOCK_ID
CODEMIND_REPO_CONTEXT_PROOF_PR_ID
CODEMIND_REPO_CONTEXT_PROOF_PHASE_ID
CODEMIND_REPO_CONTEXT_PROOF_STATUSES
buildCodemindRepoContextProofReport
```

## Files

- `src/testing/codemind-repo-context-proof.ts`
- `src/testing/codemind-repo-context-proof.spec.ts`
- `src/index.ts` (barrel exports in follow-up)
- `docs/pr-plans/PR-CM-TEST-04_REPO_CONTEXT_PROOF.md`

## Integration targets

- `src/repo-context/repo-context.types.ts`
- `src/repo-context/repo-context-summary.ts`

Reuses: `countProtectedChangedFiles`, `getHighestRepoImpactLevel`, `hasRequiredEvidenceState`, `summarizeReadOnlyRepoContext`.

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only. No provider invocation, shell execution, GitHub mutations, or merge automation.

## Vitest coverage

- canonical metadata + mutation flags all false
- REPO_CONTEXT_PROOF_READY (CI + test evidence satisfied)
- REPO_CONTEXT_PROOF_PARTIAL (missing CI evidence)
- REPO_CONTEXT_PROOF_PARTIAL (missing test evidence)
- REPO_CONTEXT_PROOF_BLOCKED (blocking notes)
- REPO_CONTEXT_PROOF_INVALID (no changed files)
- protected file counting + highest impact level
- deterministic summary

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```
