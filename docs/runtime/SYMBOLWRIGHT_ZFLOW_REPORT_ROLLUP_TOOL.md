# SymbolWright Zflow Report Rollup Tool

PR Bundle BG-BJ adds a report rollup renderer for Zflow report suites.

## Bundle scope

```txt
BG: Zflow report rollup renderer
BH: Existing catalog tool boundary
BI: Rollup input parsing and validation
BJ: Docs and tests
```

## Output modes

```txt
markdown
json
```

## Type boundary

The rollup renderer stays inside the existing catalog report capability boundary instead of widening the central runtime type unions.

```txt
name: zflow_report_catalog
capability: ZFLOW_REPORT_CATALOG
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
