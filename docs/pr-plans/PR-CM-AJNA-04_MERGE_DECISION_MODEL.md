# PR-CM-AJNA-04: Ajna Merge Decision Model

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-04` / `PR-CM-AJNA-04` / `CODEMIND-AJNA-04`

## Summary

Emits the final merge-readiness decision state. Does not merge anything —
only produces a deterministic decision with reasons.

## Files

- `src/ajna/ajna-merge-decision.ts` — implementation
- `src/ajna/ajna-merge-decision.spec.ts` — 13 tests

## Decision States

| State | Condition |
|-------|-----------|
| `MERGE_READY` | All proof ready, risk LOW or MODERATE, no operator approval required |
| `NOT_READY` | Proof gate closed without a more specific reason |
| `BLOCKED` | Risk is BLOCKED (proof blocked/missing/invalid non-critical) |
| `NEEDS_OPERATOR_REVIEW` | Risk is HIGH or CRITICAL, or `requiresOperatorApproval: true` |

## Runtime Invariants

```
mutationAllowed: false
githubWriteAllowed: false
providerInvocationAllowed: false
```

## Validation

```bash
npm run typecheck
npm test
npm run build
```
