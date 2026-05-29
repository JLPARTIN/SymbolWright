# PR-CM-AJNA-07: Ajna Operator Summary

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-07` / `PR-CM-AJNA-07` / `CODEMIND-AJNA-07`

## Summary

Short operator-facing summary for console display or PR comment preview.
Condenses the full pipeline report into status, risk, mergeReadiness,
proofScore, topBlockingReason, and operatorAction.

## Files

- `src/ajna/ajna-operator-summary.ts` — implementation
- `src/ajna/ajna-operator-summary.spec.ts` — 11 tests

## Operator Action Priority

`BLOCKED_BY_RUNTIME_BOUNDARY > BLOCKED_BY_GOVERNANCE > PROOF_MISSING >
FIX_REQUIRED > REVIEW_REQUIRED > MERGE_ALLOWED`

## Validation

```bash
npm run typecheck
npm test
npm run build
```
