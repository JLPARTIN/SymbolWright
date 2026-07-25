# SymbolWright Zflow Report Suite

PR Bundle BC-BF adds a suite layer for Zflow reports.

## Bundle scope

```txt
BC: Zflow report suite model
BD: Suite readiness rollup
BE: Suite markdown and JSON renderers
BF: Docs and tests
```

## Suite output

The suite groups an existing Zflow report catalog and artifact manifest into one operator-facing report package.

It records:

```txt
report count
artifact count
ready count
needs-review count
blocked count
overall readiness
```

## Readiness rollup

```txt
READY        all reports are ready for operator review
NEEDS_REVIEW one or more reports need recovery detail
BLOCKED      one or more reports are blocked
```

## Safety boundary

This layer is report-only.

It does not:

```txt
execute Zflow
write files
run commands
call GitHub
perform rollback
call providers
```
