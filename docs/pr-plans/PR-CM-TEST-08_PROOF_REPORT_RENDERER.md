# PR-CM-TEST-08: Proof Report Renderer

## Block
`CODEMIND-PROOF-HARNESS-08`

## PR ID
`PR-CM-TEST-08`

## Phase ID
`CODEMIND-TEST-08`

## Summary

Adds a deterministic, format-agnostic renderer for all CodeMind proof reports.
Accepts any proof report that matches `CodemindProofReportBase` and produces
output in `plain`, `markdown`, or `compact` format.

## Files

- `src/testing/codemind-proof-report-renderer.ts` — implementation
- `src/testing/codemind-proof-report-renderer.spec.ts` — 8 tests

## Design

`CodemindProofReportBase` captures the minimal shape shared by every
`CODEMIND-PROOF-HARNESS-*` report:

- canonical IDs (`blockId`, `prId`, `phaseId`)
- `status` and `summary` strings
- optional mutation-flag properties (all must be `false`)
- optional issue collections (`blockingNotes`, `flagViolations`,
  `replayErrors`, `missingSpecs`, `missingBlockIds`, `missingGates`,
  `violations`)

`renderCodemindProofReport({ report, format, renderedAt? })` dispatches to
one of three builders:

| Format | Description |
|--------|-------------|
| `plain` | Labeled key-value lines, indented issue list, validation commands |
| `markdown` | `##` heading, bold fields, fenced `bash` validation block |
| `compact` | Single line: `[STATUS] blockId \| prId \| summary` |

The `renderedAt` parameter is optional. When omitted, output is fully
deterministic and contains no timestamp or random IDs.

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
