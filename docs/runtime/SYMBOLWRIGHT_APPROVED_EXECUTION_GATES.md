# SymbolWright Retired Approval-Era Gates

This document is now a migration note for an older Phase D runtime surface.

## Status

The old representation-only tools are no longer registered as active runtime tools.

```text
apply_edit_gated       retired
command_dry_run_gated  retired
```

## Replacement surfaces

Use the current runtime surfaces instead:

```text
symbolwright agent --mode APPROVED_EXECUTION "implement the requested fix"
symbolwright local-write <json-file>
symbolwright apply-patch <json-file>
symbolwright validation-command <json-file>
symbolwright workflow <json-file>
```

## Current boundary

The old implementation only represented work. Current runtime paths use the live write, patch, validation, and workflow surfaces with workspace policy checks, protected path checks, audit output, and secret redaction.

## Migration rule

Do not restore representation-only tools as active runtime capabilities. Workspace mutation and validation must use the current runtime surfaces and must stay covered by CI.
