# CodeMind Mission Sessions

CodeMind Mission Sessions are durable, local-first records for one coding objective across repository work, Agent conversation, tool evidence, checkpoints, memory references, validation, Git commits, and pull requests.

A mission is not a second agent runtime, a checkpoint archive, or a copied memory database. It observes and connects the systems CodeMind already uses.

## Storage

Mission data is stored under the active workspace:

```text
.codemind/missions/
├── index.json
└── mission_<uuid>/
    ├── mission.json
    ├── events.jsonl
    ├── conversation.json
    ├── workspace.json
    └── artifacts/
```

The mission schema begins at version `1`. Every mission includes an optimistic-concurrency `revision` number. JSON records use atomic temporary-file replacement and retain a previous valid record for recovery. Event history is append-only JSONL; a torn or malformed event line does not prevent earlier events from loading.

Corrupt records are preserved for forensic recovery and reported as structured warnings rather than crashing mission listing. Missing or corrupt indexes are rebuilt from valid mission directories.

`.codemind/` remains excluded from Repository Workspace commit-all and automatic pull-request file selection.

## Lifecycle

Mission states are:

- `ACTIVE`
- `PAUSED`
- `COMPLETED`
- `ABANDONED`
- `FAILED`

New missions start `ACTIVE`. A paused mission returns to `ACTIVE` when resumed. Completed missions remain browsable and require an explicit reopen action. Deleting a mission requires `confirm: true` and removes only the mission record and mission-owned artifacts. It does not remove repository files, checkpoints, commits, pull requests, or shared cognitive-memory entries.

Mutation clients send the last revision they loaded. A stale revision returns HTTP `409` with the current revision and mission, preventing silent overwrites across browser tabs.

## Security and redaction

Mission persistence applies a mission-specific redaction layer before records or event payloads reach disk. It masks:

- Authorization and cookie headers
- bearer tokens
- GitHub and provider token formats
- API-key, token, secret, password, credential, and private-key fields
- `CODEMIND_API_KEY` and secret-valued environment variables
- secret-looking URL query parameters
- known private-key blocks

Provider identity and model name may be persisted. Provider API keys, CodeMind access keys, GitHub tokens, raw authorization headers, provider registration bodies, and MCP server environment configurations are not persisted.

Tool output and validation output are stored only as redacted, size-limited excerpts with hashes. Unlimited raw command logs are not mission data.

## Agent integration

`POST /api/agent` accepts an optional `missionId`. Without it, behavior remains backward compatible.

With an active mission, CodeMind:

1. loads the existing mission conversation when `priorMessages` is omitted;
2. records the user message, runtime mode, provider identity, and model;
3. runs the existing `runAgentLoop` implementation unchanged;
4. observes existing tool-start/tool-end events;
5. records the final conversation state;
6. links checkpoints created under the mission session ID;
7. links stable memory IDs surfaced by existing memory tools; and
8. emits additive `mission_saved` SSE frames.

Existing SSE event names remain unchanged. Clients that ignore `mission_saved` continue to work. A persistence error is surfaced as a mission warning and does not replace or corrupt the active Agent response.

## Repository resume and reconciliation

The repository remains the source of truth for files. Missions store paths, hashes, open-file selection, current branch, recorded HEAD, modified paths, commit SHAs, and pull-request URLs—not full repository contents.

On resume, CodeMind compares the recorded branch and HEAD with the current repository. It never switches branches automatically. The UI offers explicit choices:

- continue with current repository state;
- switch to the recorded local branch only when the repository is clean and the branch still exists;
- open the mission read-only; or
- cancel.

If the repository path is missing, Agent history, timeline, evidence, and references remain browsable. A deleted branch is reported but never recreated automatically.

## Scratch Workspace

Scratch Workspace remains browser-local and compatible with its existing `codemind.workspace.session.v1` localStorage record. Existing scratch state is never uploaded silently. The **Attach Scratch Workspace to Mission** action explicitly copies the current scratch session structure into mission state. The UI indicates whether scratch state remains local-only or is linked to the mission.

## Checkpoints and memory

Missions do not create a second checkpoint system. File writes continue to use the existing checkpoint service, while missions store checkpoint IDs, paths, timestamps, optional tool-call links, and human labels such as “Before refactor” or “Pre-release.”

Missions do not duplicate cognitive-memory content. They store stable memory entry IDs and short summaries describing whether an entry was stored or recalled. Deleting a mission never deletes shared memory.

## Export and import

A mission exports as a `codemind.mission.bundle` JSON object containing schema version `1`, a redacted mission, events, hashes/references, and warnings. Repository file content and checkpoint snapshots are excluded by default.

Import validates kind, schema, total size, event count, and structured data. The imported mission always receives a new local mission ID and begins `PAUSED`, even when the original ID does not conflict. Imported-source metadata records the original ID and export time.

## Cross-device boundary

Mission resume is browser-independent only while browsers connect to the same CodeMind server and workspace filesystem. Another browser tab or browser connected to the same running Codespaces instance can reopen the mission.

There is no cloud synchronization. A destroyed Codespace or a different machine does not contain the mission unless `.codemind/missions/` or an exported mission bundle is transferred manually.

## Authenticated API

All routes require the CodeMind access key:

```text
GET    /api/missions
POST   /api/missions
GET    /api/missions/:id
PATCH  /api/missions/:id
DELETE /api/missions/:id
POST   /api/missions/:id/pause
POST   /api/missions/:id/resume
POST   /api/missions/:id/complete
POST   /api/missions/:id/abandon
POST   /api/missions/:id/reopen
POST   /api/missions/:id/attach-scratch
POST   /api/missions/:id/switch-recorded-branch
POST   /api/missions/:id/checkpoint-label
POST   /api/missions/:id/record
GET    /api/missions/:id/events
POST   /api/missions/:id/export
POST   /api/missions/import
```

The internal `/record` contract accepts only known structured repository and validation event kinds. It is not an unrestricted raw-event ingestion endpoint.

## Difference between related systems

| System            | Source of truth                            | Mission relationship                                                    |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Mission           | Objective and resumable coordination state | Owns structured lifecycle, conversation, event timeline, and references |
| Repository        | Real working-tree files and Git state      | Mission stores paths, hashes, branch/HEAD, commits, and PR URLs         |
| Checkpoint        | Existing pre-write file snapshots          | Mission links checkpoint IDs and labels; it does not copy snapshots     |
| Cognitive memory  | Existing SQLite/YAML memory stores         | Mission links stable entry IDs and summaries; it does not copy memories |
| Scratch Workspace | Browser localStorage session               | Remains local-only unless explicitly attached                           |
