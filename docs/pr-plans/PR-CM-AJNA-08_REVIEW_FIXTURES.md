# PR-CM-AJNA-08: Ajna Snapshot Fixtures

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-08` / `PR-CM-AJNA-08` / `CODEMIND-AJNA-08`

## Summary

Deterministic fixtures for all Ajna review scenarios. Keeps future PR
development fast and safe — no random IDs, no timestamps, fully stable.

## Files

- `src/ajna/fixtures/ajna-review-fixtures.ts` — six named fixtures
- `src/ajna/fixtures/ajna-review-fixtures.spec.ts` — 9 tests

## Fixtures

| Name | Scenario |
|------|----------|
| `FIXTURE_MERGE_READY` | All proof ready, LOW risk → MERGE_ALLOWED |
| `FIXTURE_MISSING_PROOF` | All 6 domains missing → PROOF_MISSING |
| `FIXTURE_RUNTIME_BLOCKED` | Runtime boundary invalid → BLOCKED_BY_RUNTIME_BOUNDARY |
| `FIXTURE_GOVERNANCE_BLOCKED` | Governance invalid → BLOCKED_BY_GOVERNANCE |
| `FIXTURE_HIGH_RISK_PROTECTED` | 4 protected files changed → REVIEW_REQUIRED |
| `FIXTURE_GITHUB_ADAPTER_INVALID` | GitHub adapter invalid → FIX_REQUIRED |

## Validation

```bash
npm run typecheck
npm test
npm run build
```
