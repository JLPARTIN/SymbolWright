# PR-CM-TEST-07: GitHub Adapter Proof

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-07
PR-CM-TEST-07
CODEMIND-TEST-07
```

## Purpose

Prove GitHub adapters remain safe, especially read-only PR context collection. Validates that adapter mode is safe, PR identity is complete, and the response passes the read-only assertion.

## Statuses

```
GITHUB_ADAPTER_PROOF_READY    — read-only contract verified, no violations
GITHUB_ADAPTER_PROOF_PARTIAL  — (reserved)
GITHUB_ADAPTER_PROOF_BLOCKED  — blocking notes present
GITHUB_ADAPTER_PROOF_INVALID  — unsafe adapter mode, missing PR identity, or failed read-only assertion
```

## Core exports

```ts
CODEMIND_GITHUB_ADAPTER_PROOF_BLOCK_ID
CODEMIND_GITHUB_ADAPTER_PROOF_PR_ID
CODEMIND_GITHUB_ADAPTER_PROOF_PHASE_ID
CODEMIND_GITHUB_ADAPTER_PROOF_STATUSES
buildCodemindGithubAdapterProofReport
```

## Files

- `src/testing/codemind-github-adapter-proof.ts`
- `src/testing/codemind-github-adapter-proof.spec.ts`
- `src/index.ts` (barrel exports in follow-up)
- `docs/pr-plans/PR-CM-TEST-07_GITHUB_ADAPTER_PROOF.md`

## Integration targets

- `src/github/github-pr-context.types.ts`
- `src/github/github-pr-context-contract.ts`

Reuses: `assertGithubPrContextIsReadOnly`, `createReadOnlyGithubPrContextResponse`.

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only. No provider invocation, shell execution, GitHub mutations, or merge automation.

## Vitest coverage

- canonical metadata + mutation flags all false
- GITHUB_ADAPTER_PROOF_READY (read-only contract request)
- GITHUB_ADAPTER_PROOF_INVALID (non-read-only adapter mode)
- GITHUB_ADAPTER_PROOF_INVALID (incomplete PR identity)
- GITHUB_ADAPTER_PROOF_BLOCKED (blocking notes)
- no write flags in adapter response
- deterministic summary

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```
