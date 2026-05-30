# PR-CM-AJNA-09: Integrate Ajna Governance Rules into the Review Pipeline

## Block / PR / Phase

`CODEMIND-AJNA-REVIEW-09` / `PR-CM-AJNA-09` / `CODEMIND-AJNA-09`

## Summary

Integrates the Ajna governance rules engine into the backend review pipeline.

This PR keeps the pipeline deterministic, backend-only, read-only, and analysis-only.
It does not post comments, trigger providers, run shell commands, mutate repositories,
auto-merge PRs, or write persistent memory.

## Files

- `src/ajna/ajna-proof-bundle.ts`
- `src/ajna/ajna-risk-synthesis.ts`
- `src/ajna/ajna-merge-decision.ts`
- `src/ajna/ajna-review-report-composer.ts`
- `src/ajna/ajna-review-pipeline.ts`
- `src/ajna/ajna-review-pipeline.spec.ts`

## Governance Integration Flow

```txt
AjnaReviewPanelViewModel
  -> evaluateAjnaGovernanceRules()
  -> renderAjnaGovernanceReport()
  -> apply unoverridden rule failures to governance proof
  -> buildAjnaProofBundle()
  -> synthesizeAjnaRisk()
  -> buildAjnaMergeDecision()
  -> composeAjnaReviewReport()
```

## Blocking Rule

A failed governance rule blocks the pipeline only when it has no matching operator override.

```txt
failed + no override -> GOVERNANCE_PROOF_BLOCKED -> BLOCKED risk -> BLOCKED merge decision
failed + override    -> GOVERNANCE_PROOF_READY is preserved -> normal pipeline decision
```

## Runtime Boundary

```txt
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
