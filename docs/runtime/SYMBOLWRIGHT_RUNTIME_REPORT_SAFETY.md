# CodeMind Runtime Report Safety Boundary

All runtime report surfaces maintain a strict read-only posture.

## Guarantees

Every report surface enforces:

```txt
read-only       — no file writes, no mutations
no execution    — no shell commands, no tool execution
no network      — no HTTP calls, no API access
no file writes  — no output files created
deterministic   — same input always produces same output
fixture-testable — all surfaces tested via JSON fixtures
```

## Surface registry safety flags

The surface registry at:

```txt
src/runtime/workflow/runtime-report-surface-registry.ts
```

Declares safety flags for all 13 registered surfaces:

```txt
readOnly:    true (all surfaces)
noExecution: true (all surfaces)
noNetwork:   true (all surfaces)
noFileWrite: true (all surfaces)
```

## What report surfaces do

```txt
Accept structured input (objects, arrays, strings)
Compute deterministic summaries (counts, status rollup)
Render markdown or JSON string output
Return string output only — never write to disk
```

## What report surfaces do not do

```txt
Execute Zflow workflows
Write files to the filesystem
Run shell commands or subprocesses
Call GitHub API or any external service
Perform rollback or recovery operations
Call language model providers
Merge pull requests or modify repositories
Create background jobs or scheduled tasks
```

## Operator review model

Report output is intended for operator review only. The operator examines rendered output and decides next steps outside the report layer. Reports do not automate any downstream action.
