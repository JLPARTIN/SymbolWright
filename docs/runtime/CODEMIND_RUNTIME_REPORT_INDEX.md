# CodeMind Runtime Report Index

PR Bundle BK-BN adds a runtime report index for the Zflow report surfaces.

## Bundle scope

```txt
BK: Runtime report index aggregator
BL: Operator-facing build-state summary
BM: Zflow/report artifact cross-links
BN: Docs and tests
```

## Index entries

The index can summarize:

```txt
single reports
report catalog
artifact manifest
report suite
```

## Build-state summary

The index rolls entries into one status:

```txt
READY
NEEDS_REVIEW
BLOCKED
```

## Cross-links

The index records text targets for report artifacts:

```txt
report:<id>:markdown
report:<id>:json
catalog:markdown
manifest:json
suite:markdown
suite:json
```

## Safety boundary

This layer is read-only and report-only.

It does not:

```txt
execute Zflow
write files
run commands
call GitHub
perform rollback
call providers
```
