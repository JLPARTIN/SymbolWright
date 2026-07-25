# CodeMind Runtime Report Index CLI

PR Bundle BO-BR adds a fixture-based CLI renderer for the runtime report index.

## Bundle scope

```txt
BO: Runtime report index CLI
BP: Index fixture loader
BQ: Markdown and JSON output mode
BR: Docs and smoke tests
```

## Input fixture

The fixture must include:

```txt
title
format
```

Optional fields:

```txt
reports
catalog
manifest
suite
generatedAt
```

Supported formats:

```txt
markdown
json
```

## Safety boundary

The index CLI renderer is read-only and report-only.

It does not:

```txt
execute Zflow
write output files
run commands
call GitHub
perform rollback
call providers
```

The CLI reads one local JSON fixture and returns rendered index text for operator review.
