# Phase M — Approved Validation Command Gate

Phase M introduces the approved validation command gate, which evaluates whether a validation command should be allowed based on an allowlist, runtime policy, and approval tickets.

## Design

The validation command gate evaluates command requests against multiple checks:

1. **Policy check** — `policy.allowShell` must be `true`
2. **Approval check** — An approval ticket with `command:validate` scope is required
3. **Allowlist check** — The command must be in the allowlisted validation commands
4. **Reason required** — A non-empty reason must be provided

The gate returns `ALLOWED` only when all checks pass. Otherwise it returns `BLOCKED` with accumulated block reasons.

## Allowlisted Commands

The following commands are allowlisted:

```txt
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run audit
npm run build
npm run build:app
```

No other commands can pass the gate. Arbitrary shell execution is never permitted.

## Dry-Run Support

All command evaluations support a `dryRun` flag. When `dryRun` is `true`, the gate evaluates as normal but no command is executed. The rendered output clearly indicates that the command would be allowed without running it.

## Audit Events

Every gate evaluation produces a `RuntimeAuditEvent` via `createValidationCommandAuditEvent()`. The audit event records:

- Action: `validation_command`
- Status: `allowed` or `blocked`
- Detail: includes command, reason, and dry-run indicator
- Approval: the approval ticket used (if any)

## CLI Command

```txt
codemind validation-command <json-file>
```

The fixture JSON must include:

```json
{
  "command": "npm run typecheck",
  "reason": "Verify types after refactor",
  "dryRun": true
}
```

## Runtime Tool

The `validation_command_gate` tool is registered with capability `VALIDATION_COMMAND`. It parses input, evaluates the gate, and returns the combined gate result and audit output.

## Registry

`createValidationCommandRuntimeRegistry()` extends the Phase L local-write registry with the `validation_command_gate` tool, preserving all previous tools in the chain.

## Safety Boundaries

- Allowlisted commands only — no arbitrary shell execution
- Approval ticket required with `command:validate` scope
- Shell must be enabled by policy
- Audit event emitted for every evaluation
- Dry-run preview available
- No GitHub writes
- This gate evaluates permission only — no command is executed by this tool
