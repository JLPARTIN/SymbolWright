# PR-CM-AJNA-03: Ajna Risk Synthesis Engine

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-03` / `PR-CM-AJNA-03` / `CODEMIND-AJNA-03`

## Summary

Deterministic risk synthesis layer that combines proof bundle state, repo
impact level, protected file count, and blocking findings into a single
risk level with explanation.

## Files

- `src/ajna/ajna-risk-synthesis.ts` — implementation
- `src/ajna/ajna-risk-synthesis.spec.ts` — 14 tests

## Risk Level Hierarchy

`CRITICAL > BLOCKED > HIGH > MODERATE > LOW`

| Level | Condition |
|-------|-----------|
| CRITICAL | `governance` or `runtimeBoundary` is INVALID |
| BLOCKED | Any domain is BLOCKED, or blocking findings present, or proof gate closed (allProofReady false) |
| HIGH | All proof ready + protected files changed |
| MODERATE | All proof ready + repo impact level not LOW/NONE |
| LOW | All proof ready + no protected paths + low/no repo impact |

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
