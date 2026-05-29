# PR-CM-TEST-06: Runtime Boundary Proof

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-06
PR-CM-TEST-06
CODEMIND-TEST-06
```

## Purpose

Prove that CodeMind's runtime boundary remains non-executing unless explicitly authorized. Validates that all seven boundary flags are false and all required operator-approval gates are present.

## Boundary flags (all must be false)

```
providerInvocationAllowed
repoMutationAllowed
commandExecutionAllowed
githubWriteAllowed
mergeAutomationAllowed
persistentMemoryWriteAllowed
automaticSkillPromotionAllowed
```

## Statuses

```
RUNTIME_BOUNDARY_PROOF_READY    — all flags false and all required gates present
RUNTIME_BOUNDARY_PROOF_PARTIAL  — flags safe but a required operator gate is missing
RUNTIME_BOUNDARY_PROOF_BLOCKED  — blocking notes present
RUNTIME_BOUNDARY_PROOF_INVALID  — one or more flags are unexpectedly true
```

## Core exports

```ts
CODEMIND_RUNTIME_BOUNDARY_PROOF_BLOCK_ID
CODEMIND_RUNTIME_BOUNDARY_PROOF_PR_ID
CODEMIND_RUNTIME_BOUNDARY_PROOF_PHASE_ID
CODEMIND_RUNTIME_BOUNDARY_PROOF_STATUSES
buildCodemindRuntimeBoundaryProofReport
```

## Files

- `src/testing/codemind-runtime-boundary-proof.ts`
- `src/testing/codemind-runtime-boundary-proof.spec.ts`
- `src/index.ts` (barrel exports in follow-up)
- `docs/pr-plans/PR-CM-TEST-06_RUNTIME_BOUNDARY_PROOF.md`

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only. No provider invocation, shell execution, GitHub mutations, or merge automation.

## Vitest coverage

- canonical metadata + mutation flags all false
- RUNTIME_BOUNDARY_PROOF_READY (all flags false, all gates present)
- RUNTIME_BOUNDARY_PROOF_INVALID (providerInvocationAllowed true)
- RUNTIME_BOUNDARY_PROOF_INVALID (commandExecutionAllowed true)
- RUNTIME_BOUNDARY_PROOF_INVALID (githubWriteAllowed true)
- RUNTIME_BOUNDARY_PROOF_PARTIAL (required gate missing)
- RUNTIME_BOUNDARY_PROOF_BLOCKED (blocking notes)
- all flag violations reported at once
- deterministic summary

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```
