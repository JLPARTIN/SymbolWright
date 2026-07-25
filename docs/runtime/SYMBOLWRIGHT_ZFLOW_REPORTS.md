# SymbolWright Zflow Reports

PR Bundle AE-AH adds operator-facing report export surfaces for Zflow.

## Bundle scope

```txt
AE: Zflow execution report model
AF: Markdown export renderer
AG: JSON artifact snapshot
AH: Docs and tests for report export surfaces
```

## Report outputs

Zflow reports can render:

```txt
Markdown operator report
JSON artifact snapshot
stable report summary
sectioned execution output
```

## Safety boundary

Reports are export-only.

They do not:

```txt
execute tools
write files
call GitHub
merge changes
run commands
perform rollback
call providers
```

## Intended use

The report layer gives operators a durable handoff artifact for review and archival after explicit operator approval.
