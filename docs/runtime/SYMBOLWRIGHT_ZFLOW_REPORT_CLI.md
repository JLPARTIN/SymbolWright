# SymbolWright Zflow Report CLI

PR Bundle AM-AP adds a fixture-based CLI renderer for Zflow reports.

## Bundle scope

```txt
AM: Zflow report CLI
AN: CLI input fixture loader
AO: Markdown and JSON output mode
AP: Docs and smoke tests
```

## Input fixture

The fixture must include:

```txt
id
format
result
readiness
```

Supported formats:

```txt
markdown
json
```

## Safety boundary

The CLI renderer is report-only.

It does not:

```txt
execute Zflow
write output files
run commands
call GitHub
perform rollback
call providers
```

The CLI reads one local JSON fixture and returns rendered text for operator review.
