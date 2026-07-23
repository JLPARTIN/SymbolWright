# Bundle #6 — Final Autonomous Engineering Release

## Purpose

This release closes the gap between CodeMind's individual autonomy subsystems and one evidence-backed engineering outcome. The final release operation is not a second executor. It coordinates the authoritative mission planner, persistent executor, semantic edit runtime, validation and repair loop, repository intelligence, Mission Dashboard, specialist ledger, and acceptance packet.

## Operator contract

The authenticated operation is:

```text
POST /api/missions/:missionId/autonomy/release
```

The browser client exposes the same operation through `MissionAutonomyClient.release(missionId)`.

A release request behaves according to persisted state:

1. No execution record: create the semantic repository plan and start execution.
2. Non-terminal execution record: reconcile interrupted tasks and resume execution.
3. Terminal execution record: preserve completed work and regenerate current release evidence without executing completed tasks again.

The ordinary autonomy status response includes the latest persisted release record when one exists.

## Authoritative flow

```text
Mission objective
  → persisted semantic repository index
  → dependency-aware autonomous task graph
  → provider-backed transactional multi-file edits
  → ordered validation chain
  → bounded diagnosis and repair loop
  → complete validation replay
  → repository impact analysis
  → merge-readiness assessment
  → acceptance packet and PR title/body
  → durable release record
```

## Durable release record

Release records are written atomically under:

```text
.codemind/autonomy/releases/<missionId>.json
```

Each record includes:

- execution mode: `start`, `resume`, or `existing`;
- interrupted task IDs recovered during restart;
- final Mission Dashboard projection;
- specialist-agent projection when available;
- evidence-derived acceptance packet;
- impact and merge-readiness decision;
- PR title and body;
- final next action.

## Final states

| State | Meaning | Next action |
| --- | --- | --- |
| `merge-ready` | Execution, validation, evidence, and merge-readiness gates passed | Merge |
| `review-required` | Execution was accepted, but impact or evidence policy requires human review | Review |
| `blocked` | A blocker or merge-readiness failure remains | Resolve blocker |
| `failed` | The mission or bounded repair process failed | Inspect diagnostics |
| `incomplete` | Persisted execution has unfinished work | Resume |

## Safety invariants

- Completion is derived from the persisted task graph, not agent narration.
- Failed validation cannot produce a merge-ready release.
- Repair cannot skip or weaken a validation command.
- Repair attempts remain bounded and restart-safe.
- Existing operator changes remain protected by transaction conflict checks.
- Mission-owned edits are snapshotted before nested repair and restored to their pre-repair content when repair fails.
- High or critical repository impact remains review-required.
- Release and acceptance files use atomic replacement and restrictive permissions.
- Releasing a completed mission does not rerun completed tasks.

## End-to-end proof

The release integration tests build a temporary CodeMind workspace with a real MissionStore, MissionService, semantic index, planner, persistent executor, dashboard projection, impact analysis, acceptance service, and release store.

The proof covers:

- fresh mission start through merge-ready release;
- real persisted validation evidence;
- modified-file attribution;
- impact-aware merge readiness;
- PR packet generation;
- atomic acceptance and release persistence;
- mission timeline events;
- interrupted task graph recovery after restart;
- release retrieval through the authenticated status route;
- one-call browser client release and polling.

## Bundle #6 forensic completion checklist

- [x] Repository dependency-impact analysis
- [x] Explainable merge-readiness scoring
- [x] Live impact-aware acceptance gate
- [x] Semantic multi-file edit planning
- [x] Dependency-aware tool orchestration
- [x] Transactional edit rollback and conflict protection
- [x] Persistent validation and autonomous repair
- [x] Repository-specific repair learning
- [x] Restart-safe mission and repair timelines
- [x] End-to-end release operation
- [x] Acceptance and PR evidence generation
- [x] Browser/API release path
- [x] Fresh-start and interruption/resume integration proofs

Bundle #6 is complete only when the repository's full CI and aggregate `npm run validate` release gate pass on the final branch.
