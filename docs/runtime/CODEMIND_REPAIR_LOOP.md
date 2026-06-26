# CodeMind Repair Loop

This document describes the repair loop, which orchestrates the full lifecycle of an Ajna-detected finding through patch proposal, operator review, validation, and merge readiness assessment.

## Architecture

```text
RepairLoopRequest
  └── Ajna Finding (validate ID + message)
       └── Patch Proposal (validate files, reason, rollback note)
            └── Operator Review (require APPROVED decision)
                 └── Patch Application (apply structured patch)
                      └── Validation Run (check all commands pass)
                           └── Ajna Reassessment (check for blockers)
                                └── Merge Readiness Assessment (final gate)
```

## Checkpoints

The repair loop defines seven ordered checkpoints. Each checkpoint represents a gate that must pass before proceeding to the next step:

| Checkpoint                | Description                                  |
|---------------------------|----------------------------------------------|
| `AJNA_FINDING`            | Validate finding has non-empty ID and message |
| `PATCH_PROPOSED`          | Validate patch has files, reason, rollback    |
| `OPERATOR_REVIEWED`       | Require operator approval (not rejected)      |
| `PATCH_APPLIED`           | Patch has been applied to workspace           |
| `VALIDATION_RUN`          | All validation commands passed                |
| `AJNA_REASSESSED`         | Ajna reassessment completed                   |
| `MERGE_READINESS_ASSESSED`| Final merge readiness gate                    |

## Outcomes

| Outcome                 | Meaning                                           |
|--------------------------|---------------------------------------------------|
| `COMPLETED`             | Full loop passed — merge ready                     |
| `STOPPED_AT_CHECKPOINT` | Loop stopped early at requested checkpoint         |
| `BLOCKED`               | Loop blocked by validation or policy failure       |
| `VALIDATION_FAILED`     | Validation commands returned non-zero exit code    |

## CLI usage

```bash
codemind repair-loop <json-file>
```

Reads a JSON fixture containing a full repair loop request and renders the result.

## Fixture format

```json
{
  "finding": {
    "id": "F-001",
    "category": "type-error",
    "message": "Missing return type on exported function",
    "severity": "error",
    "filePath": "src/foo.ts"
  },
  "patchProposal": {
    "reason": "Add explicit return type",
    "rollbackNote": "Revert src/foo.ts to previous version",
    "files": [
      { "targetPath": "src/foo.ts", "content": "fixed content" }
    ]
  },
  "operatorReview": {
    "decision": "APPROVED",
    "reviewedBy": "operator",
    "notes": "Looks correct"
  },
  "validationResults": [
    {
      "command": "npm run typecheck",
      "exitCode": 0,
      "passed": true,
      "summary": "Typecheck passed"
    }
  ],
  "ajnaReassessment": {
    "verdict": "READY",
    "blockers": [],
    "readiness": "MERGE_READY"
  },
  "stopAtCheckpoint": null
}
```

## Safety posture

- Repair loop is deterministic and pure — no side effects
- Operator approval is required before patch application
- Validation must pass before Ajna reassessment
- Ajna blockers prevent merge readiness
- `stopAtCheckpoint` allows partial execution for debugging

## Implementation

```text
src/runtime/repair/repair-loop.ts        — repair loop engine
src/runtime/repair/repair-loop.spec.ts   — unit tests
src/cli-repair-loop.ts                   — CLI handler
fixtures/repair-loop-fixture.json        — example fixture
```
