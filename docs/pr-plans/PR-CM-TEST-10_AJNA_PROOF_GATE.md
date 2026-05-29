# PR-CM-TEST-10: Ajna Proof Gate

## Block
`CODEMIND-PROOF-HARNESS-10`

## PR ID
`PR-CM-TEST-10`

## Phase ID
`CODEMIND-TEST-10`

## Summary

Adds the Ajna Proof Gate — the top-level merge-readiness arbiter that
aggregates status from all six CodeMind proof domains and emits a single
`ajnaMayDeclareMergeReady: boolean` determination.

## Files

- `src/ajna/ajna-proof-gate.ts` — implementation
- `src/ajna/ajna-proof-gate.spec.ts` — 13 tests

## Design

`buildAjnaProofGateReport(input)` accepts an optional status string for
each proof domain. A domain that is absent (undefined) counts as not-ready.

| Domain | Ready value |
|--------|-------------|
| kernelTrace | `TRACE_PROOF_READY` |
| ajnaMatrix | `AJNA_PROOF_READY` |
| repoContext | `REPO_CONTEXT_PROOF_READY` |
| governance | `GOVERNANCE_PROOF_READY` |
| runtimeBoundary | `RUNTIME_BOUNDARY_PROOF_READY` |
| githubAdapter | `GITHUB_ADAPTER_PROOF_READY` |

`ajnaMayDeclareMergeReady` is `true` only when every domain status equals
its ready value. Any BLOCKED/INVALID/PARTIAL status, or a missing status,
results in `false`.

The `explanation` array lists each domain with its status and a `[PASS]`
or `[FAIL]` marker, followed by a final summary line. Output is fully
deterministic (stable domain order, no timestamps, no random IDs).

Status type unions are defined inline and are structurally compatible with
the concrete types that will be exported by proof modules on feature branches
once they merge to main.

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
