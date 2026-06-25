# CodeMind Operator Review Gate

This document records Phase J operator review gate for live outputs.

## Active command

```text
codemind operator-review <json-file>
```

## Purpose

The operator review gate creates review packets that require operator confirmation before any action is taken. This is the prerequisite for all future write actions: every proposed mutation must first produce a review packet that the operator can inspect and approve.

## Architecture

```text
CLI fixture -> operator review packet -> operator review gate -> rendered output
```

### Key modules

- `operator-review-packet.ts` — `createOperatorReviewPacket()`, `renderOperatorReviewPacket()`
- `operator-review-gate.ts` — `evaluateOperatorReviewGate()`, `renderOperatorReviewGateResult()`

### Review packet contents

Each packet must clearly show:
- source evidence
- proposed action
- risks
- validation
- boundary
- next manual step

### Gate decisions

- `PENDING` — operator must review and confirm before execution
- `REJECTED` — action blocked by policy (e.g. merge_pr)

## Runtime tool

```text
operator_review_packet
```

## Fixture shape

```json
{
  "id": "PKT-001",
  "sourceEvidence": ["PR #42 review evidence", "CI workflow passed"],
  "proposedAction": "post_pr_comment",
  "actionDetail": "Post a summary comment on PR #42",
  "risks": ["Comment will be visible to all repo collaborators"],
  "validation": ["Review evidence is complete", "CI is green"],
  "boundary": ["no merge", "no approval", "no label change"],
  "nextManualStep": "Operator confirms comment text and approves posting"
}
```

## Supported proposed actions

```text
post_pr_comment
apply_label
request_review
submit_review
create_pr
merge_pr (blocked by policy)
```

## Boundary

- No automatic approval is granted
- No writes are performed
- No PR comments are posted
- No merges are performed
- Operator must review the full packet and confirm before any action is taken
