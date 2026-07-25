# SymbolWright Zflow Report Catalog Tool

PR Bundle AU-AX adds a runtime tool surface for Zflow report catalogs.

## Bundle scope

```txt
AU: Zflow report catalog runtime tool
AV: Catalog registry
AW: Catalog input parsing and validation
AX: Docs and tests
```

## Tool

```txt
name: zflow_report_catalog
capability: ZFLOW_REPORT_CATALOG
```

The tool renders an already-produced list of Zflow reports as either:

```txt
markdown catalog index
json artifact manifest
```

## Registry

The catalog registry is read-only by default:

```txt
allowNetwork false
allowShell false
allowWrites false
allowGitHubWrites false
```

## Safety boundary

This tool is catalog/report-only.

It does not:

```txt
execute Zflow
write files
run commands
call GitHub
perform rollback
call providers
```
