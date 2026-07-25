# SymbolWright Approved Local File Write Execution

**Phase:** T
**Status:** COMPLETE
**Command:** `symbolwright local-write <json-file>`

## Purpose

Phase T converts the local file write gate from an evaluator-only tool into an actual approved local file writer. This is the first true write-active milestone in the SymbolWright runtime.

## Behavior

### Dry Run (dryRun: true)

- Evaluate gate (policy, approval, workspace, protected paths)
- Render diff preview showing previous content and new content
- Emit audit event
- Do not write file
- Return execution report

### Real Write (dryRun: false)

- Evaluate gate
- Confirm ALLOWED
- Read existing file content if it exists
- Create before/after diff
- Create parent directories if needed
- Write content to target path
- Emit WRITE_APPLIED audit event
- Return execution report with rollback note

## Required Approvals

- `policy.allowWrites` must be `true`
- Approval ticket must include `file:write` scope
- Target path must be inside workspace
- Target path must not be protected
- Reason must be non-empty
- Rollback note must be non-empty

## Protected Paths

Writes are blocked to:

- `.git`
- `.env`
- `.env.local`
- `node_modules`
- `dist`
- `coverage`

## Audit Events

- `local_file_write` — gate evaluation (dry-run or blocked)
- `local_file_write_execution` — actual write execution (created, updated, or failed)

## CLI

```bash
symbolwright local-write fixtures/local-write-fixture.json
```

## Boundary

```text
approval ticket required
file:write scope required
protected paths blocked
workspace only
dry-run by default
no GitHub writes
no shell execution
```
