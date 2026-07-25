# Phase L — Controlled Local File Write Gate

Phase L introduces the controlled local file write gate, which evaluates whether a local file write should be allowed based on runtime policy, approval tickets, workspace boundaries, and protected path rules.

## Design

The local file write gate evaluates write requests against multiple checks:

1. **Policy check** — `policy.allowWrites` must be `true`
2. **Approval check** — An approval ticket with `file:write` scope is required
3. **Workspace boundary** — Target path must resolve inside the workspace root
4. **Protected paths** — Target path must not be in a protected directory (`.git`, `.env`, `.env.local`, `node_modules`, `dist`, `coverage`)
5. **Reason required** — A non-empty reason must be provided
6. **Rollback note required** — A non-empty rollback note must be provided

The gate returns `ALLOWED` only when all checks pass. Otherwise it returns `BLOCKED` with accumulated block reasons.

## Dry-Run Support

All write evaluations support a `dryRun` flag. When `dryRun` is `true`, the gate evaluates as normal but no file is modified. The rendered output clearly indicates that the write would be allowed without performing it.

## Audit Events

Every gate evaluation produces a `RuntimeAuditEvent` via `createLocalFileWriteAuditEvent()`. The audit event records:

- Action: `local_file_write`
- Status: `allowed` or `blocked`
- Detail: includes target path, reason, and dry-run indicator
- Approval: the approval ticket used (if any)

## CLI Command

```txt
symbolwright local-write <json-file>
```

The fixture JSON must include:

```json
{
  "targetPath": "src/example.ts",
  "content": "file content here",
  "reason": "Why this write is needed",
  "rollbackNote": "How to undo this write",
  "dryRun": true
}
```

## Runtime Tool

The `local_file_write` tool is registered with capability `LOCAL_FILE_WRITE`. It parses input, evaluates the gate, and returns the combined gate result and audit output.

## Registry

`createLocalWriteRuntimeRegistry()` extends the Phase K write-prep registry with the `local_file_write` tool, preserving all previous tools in the chain.

## Safety Boundaries

- Approval ticket required with `file:write` scope
- Protected paths blocked
- Writes only inside workspace
- Audit event emitted for every evaluation
- Dry-run preview available
- No GitHub writes
- No shell execution
