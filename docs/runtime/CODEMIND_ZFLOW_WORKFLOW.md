# CodeMind Zflow Workflow

Phase Z composes the local self-edit workflow with the fake-client GitHub PR creation and PR collaboration seams.

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
```

## Out of scope

This phase does not add live GitHub API writes by default. It also does not add merges, force pushes, branch deletion, workflow reruns, provider calls, or network ingestion.
