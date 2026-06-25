# CodeMind Read-Only Ajna Workflow Surface

**Phase:** R
**Status:** COMPLETE
**Command:** `codemind ajna-workflow <json-file>`

## Purpose

Phase R exposes the Ajna review and merge-readiness pipelines through the Phase Q workflow composition surface. A purpose-built workflow template composes evidence read tools and Ajna pipeline tools into a single governed workflow.

## Modes

- `review` — PR evidence read + Ajna review verdict
- `merge-readiness` — PR evidence read + Ajna merge-readiness assessment
- `full` — PR evidence read + Ajna review + merge-readiness

## Fixture Format

```json
{
  "owner": "org",
  "repo": "repo",
  "prNumber": 42,
  "workflowRunId": 100,
  "mode": "full"
}
```

Fields:
- `owner` (required): repository owner
- `repo` (required): repository name
- `prNumber` (required): pull request number
- `workflowRunId` (optional): CI workflow run ID
- `mode` (required): `review`, `merge-readiness`, or `full`

## Workflow Steps

For `full` mode with `workflowRunId`:
1. `github_live_read_pr` — read PR evidence
2. `github_live_read_ci` — read CI evidence
3. `ajna_live_read_review` — Ajna review with verdict
4. `ajna_live_read_merge_readiness` — merge-readiness assessment

## Boundary

```text
read-only Ajna pipelines only
no new mutation surface
existing tool gates enforced
no comments, approvals, merges
```

## CLI

```bash
codemind ajna-workflow fixtures/ajna-workflow-fixture.json
```
