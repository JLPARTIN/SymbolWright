# SymbolWright Approved Write Preparation

This document records Phase K approved write preparation.

## Active command

```text
symbolwright write-intent <json-file>
```

## Purpose

Write preparation introduces write-intent plans and approval tickets that can later map to actual file edits or GitHub writes. This phase does not perform any actual writes — it creates validated plans that must be approved before execution.

## Architecture

```text
CLI fixture -> write intent -> validator -> approval ticket -> rendered output
```

### Key modules

- `write-intent.ts` — `createWriteIntent()`, `renderWriteIntent()`
- `write-intent-validator.ts` — `validateWriteIntent()`, `renderWriteIntentValidation()`
- `write-approval-ticket.ts` — `createWriteApprovalTicket()`, `renderWriteApprovalTicket()`

### Write intent contents

Each intent must include:
- exact target (file_edit, file_create, file_delete, github_pr_comment, etc.)
- target path
- reason
- expected diff summary
- validation plan (at least one step)
- approval ticket requirement (always true)
- rollback note

### Validation checks

- Non-empty required fields
- Target path inside workspace
- Target path not protected (.git, .env, node_modules, dist, coverage)
- Approval ticket required

### Approval ticket states

- `PENDING` — validation passed, awaiting operator approval
- `BLOCKED` — validation failed, intent must be corrected

## Runtime tool

```text
write_intent_plan
```

## Fixture shape

```json
{
  "id": "WI-001",
  "target": "file_edit",
  "targetPath": "src/cli.ts",
  "reason": "Add new CLI command",
  "expectedDiffSummary": "Add case for new command in switch block",
  "validationPlan": ["npm run typecheck", "npm test"],
  "rollbackNote": "Revert the added case block"
}
```

## Boundary

- No actual writes are performed
- No GitHub mutation
- Protected paths are blocked
- Write intent is a plan only — no file or service is modified
- Approval ticket is always required
