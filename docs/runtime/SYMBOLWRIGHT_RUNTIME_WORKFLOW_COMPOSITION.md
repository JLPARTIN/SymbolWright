# CodeMind Runtime Workflow Composition

**Phase:** Q
**Status:** COMPLETE
**Command:** `codemind workflow <json-file>`

## Purpose

Phase Q introduces governed runtime workflow composition. A workflow defines a named, bounded sequence of tool invocations that execute against the full Phase P registry chain. The workflow runner captures transcript entries and audit events at each step, enforces step limits, and reports completion or block status.

## Workflow Definition

A workflow fixture contains:

```json
{
  "name": "plan-and-validate",
  "steps": [
    { "toolName": "plan_goal", "input": { "goal": "add feature" } },
    { "toolName": "validation_plan", "input": { "focus": "feature" } }
  ],
  "maxSteps": 10
}
```

Fields:
- `name` (required): workflow name
- `steps` (required): array of steps, each with `toolName` and `input`
- `maxSteps` (optional): maximum step count, defaults to 10

## Execution Model

The workflow runner:

1. Validates the request (name, steps, maxSteps)
2. Emits a `workflow_start` audit event
3. Executes each step sequentially against the registry
4. Captures transcript entries (tool invocation and result) per step
5. Emits a `workflow_step` audit event per step
6. Stops on step limit, missing tool, or step error
7. Emits a `workflow_complete` or `workflow_step_limit` or `workflow_step_blocked` audit event

## Status Values

- `completed` — all steps executed successfully
- `blocked` — validation failed, tool not found, or step error
- `step_limit` — step limit reached before all steps executed

## Boundary

```text
governed composition only
no new mutation surface
existing tool gates enforced
no new approval scopes
no new policy fields
```

The workflow runner does not bypass any existing gate. Tools that require approval, policy checks, or scope validation still enforce those checks within the workflow.

## Registry

The workflow registry extends the Phase P GitHub write gate registry. All tools from Phases A through P are available for composition.

## CLI

```bash
codemind workflow fixtures/workflow-fixture.json
```

## Out of Scope

This phase does not add:
- New mutation capabilities
- Conditional branching or loops within workflows
- Provider-backed tool execution
- Live network calls
- GitHub writes
