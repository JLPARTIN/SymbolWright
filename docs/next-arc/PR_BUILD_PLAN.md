# CodeMind Next-Arc PR Build Plan

## Arc

```txt
CODEMIND-AJNA-REVIEW-INTELLIGENCE-01
```

## Doctrine

This arc remains backend-only, deterministic, read-only, and analysis-only.

No PR in this arc may add provider invocation, shell execution, repo mutation, GitHub write behavior, PR comment posting, merge automation, persistent memory writes, or automatic skill promotion.

## Selected 10-PR Sequence

### PR-CM-AJNA-01 — Ajna Review Session Contract

- Block: `CODEMIND-AJNA-REVIEW-01`
- Phase: `CODEMIND-AJNA-01`
- Purpose: Create the canonical review-session model for a single PR evaluation.
- Files: `src/ajna/ajna-review-session.ts`, `src/ajna/ajna-review-session.spec.ts`, `docs/pr-plans/PR-CM-AJNA-01_REVIEW_SESSION_CONTRACT.md`
- Inputs: repository, PR number, head SHA, base SHA
- Outputs: deterministic Ajna review session
- Tests: identity validation, invariant preservation, deterministic metadata

### PR-CM-AJNA-02 — Ajna Proof Bundle Aggregator

- Block: `CODEMIND-AJNA-REVIEW-02`
- Phase: `CODEMIND-AJNA-02`
- Purpose: Aggregate Proof Harness reports into one Ajna-readable bundle.
- Files: `src/ajna/ajna-proof-bundle.ts`, `src/ajna/ajna-proof-bundle.spec.ts`, `docs/pr-plans/PR-CM-AJNA-02_PROOF_BUNDLE_AGGREGATOR.md`
- Inputs: kernel trace, Ajna matrix, repo context, governance, runtime boundary, GitHub adapter, proof gate statuses
- Outputs: allProofReady, missingProofDomains, blockingProofDomains, invalidProofDomains
- Tests: all-ready, missing, blocked, invalid, deterministic ordering

### PR-CM-AJNA-03 — Ajna Risk Synthesis Engine

- Block: `CODEMIND-AJNA-REVIEW-03`
- Phase: `CODEMIND-AJNA-03`
- Purpose: Combine proof state and repo impact into deterministic risk classification.
- Files: `src/ajna/ajna-risk-synthesis.ts`, `src/ajna/ajna-risk-synthesis.spec.ts`, `docs/pr-plans/PR-CM-AJNA-03_RISK_SYNTHESIS_ENGINE.md`
- Risk levels: LOW, MODERATE, HIGH, CRITICAL, BLOCKED
- Tests: low, moderate, high, critical, blocked, deterministic explanation

### PR-CM-AJNA-04 — Ajna Merge Decision Model

- Block: `CODEMIND-AJNA-REVIEW-04`
- Phase: `CODEMIND-AJNA-04`
- Purpose: Emit a merge-readiness decision without merging anything.
- Files: `src/ajna/ajna-merge-decision.ts`, `src/ajna/ajna-merge-decision.spec.ts`, `docs/pr-plans/PR-CM-AJNA-04_MERGE_DECISION_MODEL.md`
- Decision states: MERGE_READY, NOT_READY, BLOCKED, NEEDS_OPERATOR_REVIEW
- Tests: all gates pass, partial proof, blocked proof, invalid proof, high-risk operator review

### PR-CM-AJNA-05 — Ajna Review Report Composer

- Block: `CODEMIND-AJNA-REVIEW-05`
- Phase: `CODEMIND-AJNA-05`
- Purpose: Compose deterministic human-readable review reports.
- Files: `src/ajna/ajna-review-report-composer.ts`, `src/ajna/ajna-review-report-composer.spec.ts`, `docs/pr-plans/PR-CM-AJNA-05_REVIEW_REPORT_COMPOSER.md`
- Formats: plain, markdown, compact
- Tests: merge-ready report, blocked report, missing-proof report, operator-review report, stable ordering

### PR-CM-AJNA-06 — Ajna Review Pipeline Orchestrator

- Block: `CODEMIND-AJNA-REVIEW-06`
- Phase: `CODEMIND-AJNA-06`
- Purpose: Tie session, proof bundle, risk synthesis, merge decision, and report composition together.
- Files: `src/ajna/ajna-review-pipeline.ts`, `src/ajna/ajna-review-pipeline.spec.ts`, `docs/pr-plans/PR-CM-AJNA-06_REVIEW_PIPELINE_ORCHESTRATOR.md`
- Tests: ready path, blocked path, operator-review path, input immutability, non-execution flags

### PR-CM-AJNA-07 — Ajna Operator Summary

- Block: `CODEMIND-AJNA-REVIEW-07`
- Phase: `CODEMIND-AJNA-07`
- Purpose: Produce short operator-facing summaries.
- Files: `src/ajna/ajna-operator-summary.ts`, `src/ajna/ajna-operator-summary.spec.ts`, `docs/pr-plans/PR-CM-AJNA-07_OPERATOR_SUMMARY.md`
- Actions: MERGE_ALLOWED, REVIEW_REQUIRED, FIX_REQUIRED, PROOF_MISSING, BLOCKED_BY_GOVERNANCE, BLOCKED_BY_RUNTIME_BOUNDARY
- Tests: merge-ready, blocked, missing proof, high risk, priority action selection

### PR-CM-AJNA-08 — Ajna Snapshot Fixtures

- Block: `CODEMIND-AJNA-REVIEW-08`
- Phase: `CODEMIND-AJNA-08`
- Purpose: Add deterministic fixtures for future Ajna development.
- Files: `src/ajna/fixtures/ajna-review-fixtures.ts`, `src/ajna/fixtures/ajna-review-fixtures.spec.ts`, `docs/pr-plans/PR-CM-AJNA-08_REVIEW_FIXTURES.md`
- Fixtures: merge-ready, missing proof, runtime blocked, governance blocked, high-risk protected path, GitHub adapter invalid
- Tests: deterministic fixtures, expected pass/block behavior

### PR-CM-AJNA-09 — Ajna Golden Snapshot Reports

- Block: `CODEMIND-AJNA-REVIEW-09`
- Phase: `CODEMIND-AJNA-09`
- Purpose: Add stable golden report snapshots for the completed Ajna pipeline.
- Files: `src/ajna/fixtures/ajna-golden-reports.ts`, `src/ajna/fixtures/ajna-golden-reports.spec.ts`, `docs/pr-plans/PR-CM-AJNA-09_GOLDEN_REPORTS.md`
- Tests: stable markdown, stable plain text, stable compact output

### PR-CM-AJNA-10 — Ajna Developer Integration Guide

- Block: `CODEMIND-AJNA-REVIEW-10`
- Phase: `CODEMIND-AJNA-10`
- Purpose: Document how developers consume the Ajna backend review pipeline.
- Files: `docs/AJNA_REVIEW_PIPELINE.md`, `docs/pr-plans/PR-CM-AJNA-10_DEVELOPER_INTEGRATION_GUIDE.md`
- Tests: documentation-only; CI should remain green

## Merge Order

```txt
PR-CM-AJNA-01
PR-CM-AJNA-02
PR-CM-AJNA-03
PR-CM-AJNA-04
PR-CM-AJNA-05
PR-CM-AJNA-06
PR-CM-AJNA-07
PR-CM-AJNA-08
PR-CM-AJNA-09
PR-CM-AJNA-10
```
