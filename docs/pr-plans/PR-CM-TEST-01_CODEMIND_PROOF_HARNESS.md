# PR-CM-TEST-01: CodeMind Proof Harness Foundation

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-01
PR-CM-TEST-01
CODEMIND-TEST-01
```

## Purpose

Create the core proof-domain model for CodeMind. Establishes the testing spine for Ajna: prove what is covered, reveal what is missing, and block merge-readiness when validation evidence is incomplete.

## Proof domains

```
FOUNDATION
AJNA_REVIEW_CORTEX
REPO_CONTEXT
GITHUB_ADAPTERS
PERMISSIONS
AGENT_KERNEL
RUNTIME_BOUNDARY
```

## Domain states

```
COVERED  — all required specs exist
PARTIAL  — some required specs exist
MISSING  — no required specs exist
BLOCKED  — blocking notes present
```

## Core exports

```ts
CODEMIND_PROOF_HARNESS_BLOCK_ID
CODEMIND_PROOF_HARNESS_PR_ID
CODEMIND_PROOF_HARNESS_PHASE_ID
CODEMIND_PROOF_HARNESS_DOMAINS
CODEMIND_PROOF_HARNESS_STATES
buildCodemindProofHarnessReport
```

## Files

- `src/testing/codemind-proof-harness.ts`
- `src/testing/codemind-proof-harness.spec.ts`
- `src/index.ts` (barrel exports added in PR-CM-TEST-01B)
- `docs/pr-plans/PR-CM-TEST-01_CODEMIND_PROOF_HARNESS.md`

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only.

No provider invocation, shell execution, file mutation, GitHub mutation adapters, PR comment posting, merge automation, persistent memory writes, automatic skill promotion, live agent execution, or planning behavior changes.

## Vitest coverage

- canonical metadata
- runtime mutation disabled (`mutationAllowed`, `githubWriteAllowed`, `providerInvocationAllowed` all `false`)
- COVERED state
- PARTIAL state
- MISSING state
- BLOCKED state
- deterministic sorting
- deduplication
- mergeReady true only when all domains covered

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```
