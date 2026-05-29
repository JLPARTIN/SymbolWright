# PR-CM-AJNA-06: Ajna Review Pipeline Orchestrator

## Block / PR / Phase
`CODEMIND-AJNA-REVIEW-06` / `PR-CM-AJNA-06` / `CODEMIND-AJNA-06`

## Summary

Ties together review session, proof bundle, risk synthesis, merge decision,
and review report into a single deterministic `runAjnaReviewPipeline()` call.

## Files

- `src/ajna/ajna-review-pipeline.ts` — implementation
- `src/ajna/ajna-review-pipeline.spec.ts` — 9 tests

## Pipeline Flow

```
identity + proofStatuses + context
  → AjnaReviewSession
  → AjnaProofBundle
  → AjnaRiskSynthesis
  → AjnaMergeDecision
  → AjnaReviewReport (plain format)
  → AjnaRuntimeBoundarySnapshot (all flags false)
```

## Validation

```bash
npm run typecheck
npm test
npm run build
```
