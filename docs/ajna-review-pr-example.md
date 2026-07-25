# Ajna review-pr example

This document shows how to render a local, read-only Ajna PR review report from committed example evidence.

## Command

```bash
symbolwright ajna review-pr examples/ajna/review-pr.ready.json
```

## Expected behavior

The command reads the local JSON file, reuses the Ajna merge-readiness engine, and renders a Markdown Ajna Review Cortex report.

It does not:

- call an LLM provider
- fetch live GitHub PR data
- mutate a repository
- post PR comments
- execute validation commands
- merge anything

## Example input shape

The JSON file contains:

- `request` — repository, branch, changed-file, and evidence requirements
- `findings` — Ajna findings with evidence references and merge-blocker flags
- `recommendedNextAction` — optional operator-facing action text

## Runtime boundary

This example keeps Ajna in local evidence mode. Live GitHub ingestion should remain a separate future adapter PR so the fixture path stays deterministic and easy to test.
