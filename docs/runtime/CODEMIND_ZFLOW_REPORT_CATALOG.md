# CodeMind Zflow Report Catalog

PR Bundle AQ-AT adds a catalog and artifact manifest layer for Zflow reports.

## Bundle scope

```txt
AQ: Zflow report catalog model
AR: Report artifact manifest
AS: Catalog markdown index renderer
AT: Docs and tests
```

## Catalog output

The catalog groups already-created Zflow reports into an operator-facing index.

It records:

```txt
report id
mode
local result
readiness
tags
```

## Artifact manifest

The manifest lists report export artifacts:

```txt
markdown
json
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
