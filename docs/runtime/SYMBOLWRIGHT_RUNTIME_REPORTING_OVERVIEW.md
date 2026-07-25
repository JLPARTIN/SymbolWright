# SymbolWright Runtime Reporting Overview

The runtime reporting arc provides read-only operator-facing report surfaces for Zflow output review and archival.

## Report surface layers

```txt
1. zflow-report           — single Zflow execution report
2. zflow-report-catalog   — grouped catalog of reports
3. zflow-report-suite     — suite rollup across catalog entries
4. zflow-report-rollup    — rollup runtime tool
5. runtime-report-index   — cross-surface index with status summary
6. runtime-report-note    — operator-facing summary note
7. runtime-report-bundle-manifest — bundle packaging manifest
8. runtime-report-collection — grouped collection of indexes, notes, manifests
9. runtime-report-hub     — central hub tying all surfaces together
```

## Supporting modules

```txt
runtime-report-status          — shared status type and reduction logic
runtime-report-fixture-guards  — shared fixture parsing utilities
runtime-report-surface-registry — static discovery metadata for all surfaces
```

## CLI renderers

```txt
cli-runtime-zflow-report            — renders zflow report from fixture
cli-runtime-zflow-report-catalog    — renders catalog from fixture
cli-runtime-report-index            — renders index from fixture
cli-runtime-report-note             — renders note from fixture
cli-runtime-report-collection       — renders collection from fixture
cli-runtime-report-hub              — renders hub from fixture
```

## Status model

All report surfaces use a shared status type:

```txt
READY        — surface is complete and reviewed
NEEDS_REVIEW — surface needs operator attention
BLOCKED      — surface cannot proceed
```

Status reduction follows dominance rules:

```txt
BLOCKED dominates NEEDS_REVIEW
NEEDS_REVIEW dominates READY
Empty surfaces default to READY
READY_FOR_OPERATOR_REVIEW maps to READY
```

## Safety boundary

All report surfaces are read-only.

They do not:

```txt
execute tools
write files
call GitHub
run commands
perform rollback
call providers
access network
```
