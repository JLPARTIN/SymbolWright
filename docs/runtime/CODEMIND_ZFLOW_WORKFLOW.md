# CodeMind Zflow Workflow

Phase Z composes the local self-edit workflow with the fake-client GitHub PR creation and PR collaboration seams.

PR Bundle AB-AD extends Zflow with recovery ledger output, rollback-plan output, readiness summarization, and an operator handoff packet.

This is a workflow composition layer. It does not enable live GitHub mutation by default.

## Modes

```txt
preview-only
local-apply
local-apply-and-validate
prepare-pr
```

## Safety boundary

Zflow composes existing gates and seams:

```txt
apply_patch
local file write gate
validation command gate
GitHub PR creation fake client
PR collaboration fake client
recovery change ledger
rollback plan renderer
operator review packet
operator review gate
```

## Recovery output

Zflow now renders:

```txt
CodeMind recovery change ledger
Rollback plan
```

The recovery output is reporting-only. It does not execute rollback steps.

## Operator handoff

The handoff layer renders:

```txt
CodeMind zflow handoff
Readiness summary
CodeMind operator review packet
Operator review gate result
```

## Out of scope

This phase does not add live GitHub API writes by default. It also does not add merges, force pushes, branch deletion, workflow reruns, provider calls, network ingestion, or rollback execution.
