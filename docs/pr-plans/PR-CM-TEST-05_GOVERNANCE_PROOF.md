# PR-CM-TEST-05: Governance / Permission Proof

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-05
PR-CM-TEST-05
CODEMIND-TEST-05
```

## Purpose

Prove that CodeMind permission and governance decisions are safe. Validates read-only approval, mutation blocking, protected path escalation, and highest disposition resolution.

## Statuses

```
GOVERNANCE_PROOF_READY    — all test cases pass, no blockers
GOVERNANCE_PROOF_PARTIAL  — no test cases provided or none passed
GOVERNANCE_PROOF_BLOCKED  — blocking notes present
GOVERNANCE_PROOF_INVALID  — one or more test cases produced unexpected dispositions
```

## Core exports

```ts
CODEMIND_GOVERNANCE_PROOF_BLOCK_ID
CODEMIND_GOVERNANCE_PROOF_PR_ID
CODEMIND_GOVERNANCE_PROOF_PHASE_ID
CODEMIND_GOVERNANCE_PROOF_STATUSES
buildCodemindGovernanceProofReport
```

## Files

- `src/testing/codemind-governance-proof.ts`
- `src/testing/codemind-governance-proof.spec.ts`
- `src/index.ts` (barrel exports in follow-up)
- `docs/pr-plans/PR-CM-TEST-05_GOVERNANCE_PROOF.md`

## Integration targets

- `src/permissions/codemind-permission.types.ts`
- `src/permissions/codemind-permission-policy.ts`

Reuses: `evaluateCodemindPermissionRequest`, `resolveHighestDisposition`.

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only. No provider invocation, shell execution, GitHub mutations, or merge automation.

## Vitest coverage

- canonical metadata + mutation flags all false
- GOVERNANCE_PROOF_READY (all test cases pass)
- GOVERNANCE_PROOF_INVALID (test case disposition mismatch)
- GOVERNANCE_PROOF_BLOCKED (blocking notes)
- repo mutation blocked without operator approval
- protected path escalates disposition
- highest disposition resolved across all results
- deterministic summary

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```
