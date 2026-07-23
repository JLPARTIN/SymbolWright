# Bundle #6 Slice 3 — Semantic Multi-File Engineering and Tool Orchestration

This slice connects CodeMind's persisted repository semantic index to the live provider-backed editing path.

## Execution model

1. Build a semantic edit plan from the task's declared write scope and repository index.
2. Expand the plan to known direct and transitive importers.
3. Order dependency providers before their importers.
4. Provide the agent with deterministic inspect, edit, and verify phases.
5. Start a guarded working-tree transaction before tool execution.
6. Block edits that overlap pre-existing operator changes.
7. Reject and roll back edits outside a declared semantic impact scope.
8. Roll back partial changes when the provider or agent loop fails.
9. Persist semantic-plan and transaction evidence with the task result.

## Safety boundaries

- Existing operator changes are never silently overwritten.
- A failed edit task cannot leave newly introduced partial changes behind.
- A declared task cannot modify unrelated files without being blocked and rolled back.
- Discovery-mode tasks remain possible when the semantic planner has no concrete write target.
- Git restore is limited to paths introduced after the transaction began.
- Untracked files introduced by the task are removed during rollback.

## Validation coverage

The slice includes focused tests for dependency ordering, semantic scope expansion, objective-driven discovery, transaction conflicts, unexpected-path detection, tracked/untracked rollback, prompt orchestration, successful commit, and provider-failure rollback.
