# PR-CM-AJNA-01: Ajna Review Session Contract

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-01` / `PR-CM-AJNA-01` / `CODEMIND-AJNA-01`

## Summary

Creates the canonical review-session model that all Ajna review operations
flow through. The session is the container for a single PR review evaluation.

## Files

- `src/ajna/ajna-review-session.ts` — implementation
- `src/ajna/ajna-review-session.spec.ts` — 16 tests

## Design

`buildAjnaReviewSession(input)` validates the PR identity and returns an
immutable `AjnaReviewSession`. Validation rules:

- `repository` — non-empty, non-whitespace string
- `pullRequestNumber` — positive integer (≥ 1)
- `headSha` — non-empty string
- `baseSha` — non-empty string

`sessionId` is derived deterministically from the identity:
`{repository}#{pullRequestNumber}@{headSha[0..12]}`

`createdAtIso` is optional. When omitted, it defaults to `''` for
deterministic output.

## Runtime Invariants

```
providerInvocationAllowed: false
repoMutationAllowed: false
githubWriteAllowed: false
commandExecutionAllowed: false
```

## Validation

```bash
npm run typecheck
npm test
npm run build
```
