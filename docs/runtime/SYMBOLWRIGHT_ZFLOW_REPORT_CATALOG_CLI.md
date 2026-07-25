# CodeMind Zflow Report Catalog CLI

PR Bundle AY-BB adds a fixture-based CLI renderer for Zflow report catalogs.

## Bundle scope

```txt
AY: Zflow report catalog CLI
AZ: Catalog fixture loader
BA: Markdown and JSON output mode
BB: Docs and smoke tests
```

## Input fixture

The fixture must include:

```txt
title
format
reports
```

Optional field:

```txt
generatedAt
```

Supported formats:

```txt
markdown
json
```

## Safety boundary

The catalog CLI renderer is report-only.

It does not:

```txt
execute Zflow
write output files
run commands
call GitHub
perform rollback
call providers
```

The CLI reads one local JSON fixture and returns rendered catalog text for operator review.
