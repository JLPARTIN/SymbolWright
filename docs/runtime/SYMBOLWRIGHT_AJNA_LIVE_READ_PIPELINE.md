# SymbolWright Ajna Live-Read Review Pipeline

This document records Phase I Ajna live-read review pipeline.

## Active command

```text
symbolwright ajna-live-read <json-file>
```

## Purpose

The Ajna live-read pipeline connects live-read evidence into Ajna review and merge-readiness assessments. Evidence flows from the live-read client through evidence builders and into Ajna pipelines. Verdicts remain deterministic.

## Architecture

```text
CLI fixture -> FakeLiveReadClient -> evidence builders -> Ajna bridge -> rendered output
```

### Two modes

- `review` — runs Ajna review with deterministic verdict (READY / NEEDS_WORK) and findings
- `merge-readiness` — assesses blockers and produces a readiness summary

### Key modules

- `live-read-ajna-review-pipeline.ts` — `runLiveReadAjnaReview()`, `renderLiveReadAjnaReview()`
- `live-read-ajna-merge-readiness-pipeline.ts` — `assessLiveReadMergeReadiness()`, `renderLiveReadAjnaMergeReadiness()`

### Dependency injection

The registry creates tools with an injected `RuntimeLiveReadClient` instance. Unit tests use the fake client, proving the pipeline works without requiring live credentials.

## Runtime tools

```text
ajna_live_read_review
ajna_live_read_merge_readiness
```

## Fixture shape

```json
{
  "mode": "review",
  "owner": "owner",
  "repo": "repo",
  "prNumber": 42,
  "clientData": {
    "pr": { "number": 42, "title": "Example", "state": "open", "merged": false, "base": "main", "head": "feat/x", "changedFiles": [], "additions": 0, "deletions": 0 },
    "ci": { "workflow": "CI", "conclusion": "success", "jobs": [{ "name": "build", "conclusion": "success" }] }
  }
}
```

## Boundary

- Read-only evidence review only
- No comments are posted
- No review submissions
- No merges are performed
- No labels are written
- No workflow reruns are requested
