# PR-CM-TEST-03: Ajna Proof Matrix

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-03
PR-CM-TEST-03
CODEMIND-TEST-03
```

## Purpose

Give Ajna a deterministic proof matrix for PR review confidence. Ajna can reason over risk findings, evidence quality, merge readiness, blocked statuses, missing test proof, and kernel trace proof status.

## Statuses

```
AJNA_PROOF_READY    — all required Ajna specs exist and no blockers
AJNA_PROOF_PARTIAL  — some required specs are missing
AJNA_PROOF_BLOCKED  — blocking findings present or kernel trace is TRACE_PROOF_BLOCKED
AJNA_PROOF_INVALID  — kernel trace proof is TRACE_PROOF_INVALID
```

## Core exports

```ts
CODEMIND_AJNA_PROOF_MATRIX_BLOCK_ID
CODEMIND_AJNA_PROOF_MATRIX_PR_ID
CODEMIND_AJNA_PROOF_MATRIX_PHASE_ID
CODEMIND_AJNA_PROOF_MATRIX_STATUSES
buildCodemindAjnaProofMatrixReport
```

## Files

- `src/testing/codemind-ajna-proof-matrix.ts`
- `src/testing/codemind-ajna-proof-matrix.spec.ts`
- `src/index.ts` (barrel exports in follow-up)
- `docs/pr-plans/PR-CM-TEST-03_AJNA_PROOF_MATRIX.md`

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only. No provider invocation, shell execution, GitHub mutations, PR comments, merge automation, or persistent state.

## Vitest coverage

- canonical metadata + mutation flags all false
- AJNA_PROOF_READY (all specs covered, ajnaCanDeclareMergeReady true)
- AJNA_PROOF_PARTIAL (some specs missing)
- AJNA_PROOF_BLOCKED (blocking findings)
- AJNA_PROOF_BLOCKED (kernel trace TRACE_PROOF_BLOCKED)
- AJNA_PROOF_INVALID (kernel trace TRACE_PROOF_INVALID)
- deterministic sort + deduplication
- stable output across identical calls

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```
