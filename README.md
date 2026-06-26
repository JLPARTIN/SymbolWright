<p align="center">
  <img src="assets/codemind-logo.png" alt="CodeMind" width="900"/>
</p>

<p align="center">
  <strong>Standalone AI coding-agent platform for repository intelligence, safe code work, PR review, and merge-readiness.</strong>
</p>

CodeMind is being built as a governed coding-agent platform. It starts read-only and plan-first, then grows toward approved code edits, validation, CI diagnosis, PR preparation, and merge-readiness workflows.

Ajna Review Cortex is the first native CodeMind capability. Ajna gives CodeMind a deterministic review layer for pull-request evidence, local fixture pipelines, and merge-readiness reporting before live provider or live GitHub mutation work is introduced.

## Current State

CodeMind currently has a TypeScript CLI foundation with Vitest coverage, active read-only runtime commands, proposal-mode output, a bounded read-only runtime loop, approval-gated dry-run execution, local PR/CI fixture read adapters, a live read policy handshake, a live read client seam, a GitHub live read adapter behind policy, an Ajna live-read review pipeline, an operator review gate for live outputs, approved write preparation, an approved local file write execution gate, an approved validation command gate, PR preparation from approved local changes, a governed GitHub write proposal gate, an approved GitHub write gate, a governed runtime workflow composition surface, a read-only Ajna workflow surface, a runtime status dashboard, a build state ledger with consistency checks, and a project context kernel for repo-aware instruction loading.

`codemind status` now reports post-Phase T runtime build state, including completed phase count. All runtime phases are complete.

The active CLI package is `codemind` and exposes:

```txt
codemind help
codemind status
codemind plan <goal>
codemind read <path>
codemind search <query>
codemind validation-plan [focus]
codemind propose-patch <goal>
codemind pr-notes [focus]
codemind pr-notes --fixture-file <json-file>
codemind ci-review [source]
codemind ci-review --fixture-file <json-file>
codemind runtime run <goal> --read-only
codemind runtime run <goal> --approval-ticket <id>
codemind live-read-policy <json-file>
codemind live-read-client-fixture <json-file>
codemind github-live-read <json-file>
codemind ajna-live-read <json-file>
codemind operator-review <json-file>
codemind write-intent <json-file>
codemind local-write <json-file>
codemind validation-command <json-file>
codemind pr-preparation <json-file>
codemind github-write-proposal <json-file>
codemind github-write-gate <json-file>
codemind workflow <json-file>
codemind ajna-workflow <json-file>
codemind runtime-status
codemind project-context [dir]
codemind scan [dir]
codemind ajna scan-profile [dir]
codemind ajna docs
codemind ajna client-pipeline-manifest
codemind ajna client-pipeline-status
codemind ajna review-pr <json-file>
codemind ajna review-pr-github-fixture <json-file>
codemind ajna review-pr-github-api-fixture <json-file>
codemind ajna github-api-snapshot-fixture <json-file>
codemind ajna client-collector-fixture <json-file>
codemind ajna review-pr-client-collector-fixture <json-file>
codemind ajna merge-readiness-client-collector-fixture <json-file>
codemind ajna review-pr-collector-fixture <json-file>
codemind ajna review-pr-readonly-collector-fixture <json-file>
codemind ajna github-readonly-collector-fixture <json-file>
codemind ajna merge-readiness <json-file>
```

The Phase A read-only runtime commands are intentionally non-mutating:

```txt
codemind plan "add guarded patch proposal"
codemind read README.md
codemind search runtime
codemind validation-plan "runtime activation"
```

The Phase B proposal-mode commands add useful coding-agent output without applying changes:

```txt
codemind propose-patch "add guarded patch proposal"
codemind pr-notes "proposal mode"
codemind ci-review "local fixture"
```

The Phase C read-only runtime loop runs a bounded tool sequence and captures a transcript:

```txt
codemind runtime run "prepare proposal follow-up" --read-only
```

The Phase D approval gate path represents approved actions with audit output:

```txt
codemind runtime run "dry-run approved follow-up" --approval-ticket APPROVE-123
```

No approval ticket means approved execution fails. The current Phase D path is still dry-run by design: it records approval-gated edit and command representations, emits audit events, blocks protected paths, and does not modify files, execute shell commands, use network access, call providers, post PR comments, or mutate GitHub state.

The Phase E read adapter path uses local fixture evidence for PR and workflow review:

```txt
codemind pr-notes --fixture-file fixtures/github-read-fixture.json
codemind ci-review --fixture-file fixtures/github-read-fixture.json
```

These commands read local fixture evidence only. They do not call live GitHub APIs, post comments, request approvals, merge pull requests, push branches, or rerun workflows.

The Phase F live read policy handshake evaluates whether a future live read request would be allowed by CodeMind policy:

```txt
codemind live-read-policy fixtures/live-read-request.json
```

This command reads a local JSON fixture describing a proposed live read request and returns a policy decision (ALLOW or BLOCK) without performing the live read. It validates provider, purpose, scopes, and dry-run status against the policy allowlist.

The Phase G live read client seam runs fake client evidence through the existing evidence pipeline:

```txt
codemind live-read-client-fixture fixtures/live-read-client-fixture.json
```

This command uses a provider-neutral `RuntimeLiveReadClient` interface with a `FakeLiveReadClient` implementation. It exercises `getPullRequestEvidence`, `getWorkflowEvidence`, and `getRepositoryFile` methods and passes the results through the existing evidence builders and Ajna evidence bridge. No live service calls are made.

The Phase H GitHub live read adapter adds policy-gated GitHub read operations:

```txt
codemind github-live-read fixtures/github-live-read-fixture.json
```

This command wraps a `RuntimeLiveReadClient` in a `GitHubLiveReadPolicyWrapper` that enforces policy checks before every read operation. The `GitHubLiveReadClient` class defines the real GitHub adapter seam but is not yet wired to live network calls. Unit tests use the fake client through the policy wrapper. Allowed operations: read PR metadata, read changed files list, read check/workflow summary, read file content. Forbidden: comments, approvals, merges, branch pushes, workflow reruns.

The Phase I Ajna live-read review pipeline connects live-read evidence into Ajna review and merge-readiness:

```txt
codemind ajna-live-read fixtures/ajna-live-read-fixture.json
```

This command supports two modes: `review` (Ajna review with deterministic verdict) and `merge-readiness` (blocker assessment). Evidence flows from the fake live-read client through evidence builders and into Ajna pipelines. Verdicts remain deterministic. No comments, review submissions, merges, or workflow reruns.

The Phase N PR preparation generates a PR title, body, changed file list, and validation checklist from approved local changes:

```txt
codemind pr-preparation fixtures/pr-preparation-fixture.json
```

This command evaluates a PR preparation request. It checks that title, body, base/head branches, changed files, validation checklist, and reason are all provided and valid. The evaluator returns READY or INCOMPLETE with accumulated issues. The output includes validation checklist with unchecked checkboxes. No branch is pushed. No PR is created. No GitHub writes.

The Phase O governed GitHub write proposal creates structured proposals for GitHub write actions:

```txt
codemind github-write-proposal fixtures/github-write-proposal-fixture.json
```

This command evaluates a proposed GitHub write action (create draft PR, post comment, or apply label) against the allowed action set. It returns PROPOSED when all fields are valid, or BLOCKED with accumulated block reasons. Disallowed actions (e.g. merge_pr, force_push, delete_branch) are always blocked. The output includes clear PROPOSAL_ONLY status. No GitHub API call is made. No PR is created, no comment posted, no label applied.

The Phase P approved GitHub write gate evaluates GitHub write actions against policy, approval, and action allowlist:

```txt
codemind github-write-gate fixtures/github-write-gate-fixture.json
```

This command evaluates a GitHub write request through the approval-gated write gate. It checks that GitHub writes are enabled by policy (`allowGitHubWrites`), an approval ticket with `github:write` scope is present, the action is in the allowed set (create draft PR, post comment, apply label), and repository/target/content/reason are provided. The gate returns ALLOWED or BLOCKED with accumulated block reasons. Dry-run mode (default) previews the decision without executing. An audit event is emitted for every evaluation. No GitHub API call is made by this tool. No merge.

The Phase Q runtime workflow composition runs a governed workflow that composes registered tools into a bounded, sequenced execution:

```txt
codemind workflow fixtures/workflow-fixture.json
```

This command reads a workflow definition from a local JSON fixture. The workflow specifies a name, a sequence of tool steps (each with a tool name and input), and an optional step limit. The workflow runner validates the request, then executes each step against the full Phase P registry, capturing transcript entries and audit events at each step. If a tool is not found or a step fails, the workflow stops and reports the block reason. No new mutation surface is added — the workflow runner enforces existing tool gates. Audit events are emitted for workflow start, each step, and workflow completion.

The Phase R read-only Ajna workflow surface provides a purpose-built workflow template for Ajna review and merge-readiness:

```txt
codemind ajna-workflow fixtures/ajna-workflow-fixture.json
```

This command reads a fixture specifying owner, repo, prNumber, optional workflowRunId, and mode (`review`, `merge-readiness`, or `full`). It builds a predefined Ajna workflow that composes `github_live_read_pr`, optionally `github_live_read_ci`, and the appropriate Ajna pipeline tools (`ajna_live_read_review` and/or `ajna_live_read_merge_readiness`). The workflow runs through the Phase Q workflow runner with transcript and audit capture. Read-only Ajna pipelines only. No new mutation surface.

The Phase S runtime status dashboard provides a comprehensive view of the runtime state:

```txt
codemind runtime-status
```

This command shows the full runtime status dashboard including completed phase count, next phase, registered tool inventory with capabilities, policy snapshot (mode, allowNetwork, allowShell, allowWrites, allowGitHubWrites, protected paths), workflow and Ajna workflow support flags, and a phase summary listing all phases with their state. Read-only status only. No new mutation surface.

The Phase M approved validation command gate evaluates validation commands against an allowlist, policy, and approval:

```txt
codemind validation-command fixtures/validation-command-fixture.json
```

This command evaluates a validation command request through the allowlisted command gate. It checks that shell execution is enabled by policy, an approval ticket with `command:validate` scope is present, the command is in the allowlist (`npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run lint`, `npm run audit`, `npm run build`, `npm run build:app`), and a reason is provided. The gate returns ALLOWED or BLOCKED with accumulated block reasons. Dry-run mode previews the decision without executing any command. An audit event is emitted for every evaluation. No arbitrary shell execution. No GitHub writes.

The Phase T approved local file write execution converts the local file write gate into an actual file writer:

```txt
codemind local-write fixtures/local-write-fixture.json
```

This command executes an approved local file write through the approval-gated write gate. It checks that writes are enabled by policy (`allowWrites`), an approval ticket with `file:write` scope is present, the target path is inside the workspace and not protected, and reason/rollback note are provided. When `dryRun` is true (the default), the gate evaluates permission and renders a diff preview without modifying any file. When `dryRun` is false and all checks pass, the file is written to disk, parent directories are created if needed, and a before/after diff is captured. An audit event is emitted for every evaluation and execution. Protected paths (.git, .env, .env.local, node_modules, dist, coverage) are always blocked. No GitHub writes. No shell execution.

The Phase K approved write preparation introduces write-intent plans and approval tickets:

```txt
codemind write-intent fixtures/write-intent-fixture.json
```

This command creates a write intent plan showing the exact target, reason, expected diff summary, validation plan, approval ticket requirement, and rollback note. The intent is validated against workspace boundaries and protected paths, then a write approval ticket is issued (PENDING or BLOCKED). No actual writes are performed. No GitHub mutation.

The Phase J operator review gate creates review packets that require operator confirmation before any action:

```txt
codemind operator-review fixtures/operator-review-fixture.json
```

This command creates an operator review packet showing source evidence, proposed action, risks, validation, boundary, and next manual step. The review gate evaluates the packet and returns a decision (PENDING or REJECTED). No automatic approval is granted. Blocked actions (e.g. merge_pr) are rejected by policy. No writes, no PR comments, no merges.

Current Ajna work is intentionally local-first:

```txt
local fixtures -> collector snapshot -> Ajna review input -> review report -> merge-readiness
```

The recent client-collector fixture pipeline is visible through:

```txt
codemind ajna docs
codemind ajna client-pipeline-manifest
codemind ajna client-pipeline-status
```

These commands document and check the local fixture chain without introducing live GitHub ingestion, live PR comments, provider calls, shell execution, or repository mutation.

## Build and Validation

The repository is a TypeScript app using Vitest, ESLint, TypeScript, and npm scripts.

Primary validation commands:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run audit
npm run build
npm run build:app
```

Script map:

```txt
npm run typecheck     tsc -p tsconfig.json --noEmit
npm test              vitest run
npm run test:coverage vitest run --coverage
npm run lint          eslint src/
npm run audit         npm audit --omit=dev --audit-level=high
npm run build         tsc -p tsconfig.json
npm run build:app     npm run typecheck && npm run build
```

## Safety Posture

CodeMind starts with a conservative operating model:

```txt
read-only first
plan-first by default
proposal-only before execution
bounded loops before approved execution
approval ticket required for gated execution
local fixtures before live integrations
no network by default
no file writes without operator approval
no shell execution without operator approval
no uncontrolled PR mutation
```

Write actions, live GitHub operations, command execution, PR comments, approvals, merges, and provider-backed reasoning should stay behind explicit policy gates and operator approval.

## Planned Full Build State

The full CodeMind build is intended to become a governed repo-aware coding-agent platform that can:

```txt
understand repository structure
load project instructions
scan code and docs
plan implementation work
propose patches
edit approved files
run approved validation commands
diagnose CI failures
prepare PR summaries
review pull requests
assess merge-readiness
coordinate specialized capabilities such as Ajna Review Cortex
support Codespaces/operator runbooks
```

The planned full platform should add these layers in order:

```txt
1. Foundation doctrine, permission model, and safety gates
2. CLI and terminal UX contract
3. Read-only repo scanner and project context loading
4. Plan and patch proposal renderers
5. Approved file edit and command gates
6. Git / PR / CI read adapters
7. Ajna PR review and merge-readiness engine
8. Operator review gate for write actions
9. Live GitHub integrations behind policy controls
10. Broader CodeMind runtime integration
```

Ajna's build path remains evidence-first:

```txt
PR evidence schema
local collector fixtures
offline API payload adapter
collector snapshot contract
review-pr normalization
merge-readiness reporting
client pipeline manifest/status checks
future live read adapters behind policy gates
```

## Current Foundation Docs

```txt
docs/migration/AELIB_CODEMIND_EXTRACTION_NOTES.md
docs/roadmap/CODEMIND_PLATFORM_ROADMAP.md
docs/governance/CODEMIND_PERMISSION_MODEL.md
docs/governance/CODEMIND_THREAT_MODEL.md
docs/cli/CODEMIND_CLI_TERMINAL_UX_PLAN.md
docs/cli-plan-command.md
docs/runtime/CODEMIND_RUNTIME_FOUNDATION.md
docs/runtime/CODEMIND_RUNTIME_BUILD_STATE.md
docs/runtime/CODEMIND_RUNTIME_READONLY_COMMANDS.md
docs/runtime/CODEMIND_PROPOSAL_MODE.md
docs/runtime/CODEMIND_READONLY_LOOP.md
docs/runtime/CODEMIND_APPROVED_EXECUTION_GATES.md
docs/runtime/CODEMIND_READ_ADAPTERS.md
docs/runtime/CODEMIND_LIVE_READ_POLICY_HANDSHAKE.md
docs/runtime/CODEMIND_LIVE_READ_CLIENT_SEAM.md
docs/runtime/CODEMIND_GITHUB_LIVE_READ_ADAPTER.md
docs/runtime/CODEMIND_AJNA_LIVE_READ_PIPELINE.md
docs/runtime/CODEMIND_OPERATOR_REVIEW_GATE.md
docs/runtime/CODEMIND_APPROVED_WRITE_PREPARATION.md
docs/runtime/CODEMIND_CONTROLLED_LOCAL_FILE_WRITE_GATE.md
docs/runtime/CODEMIND_APPROVED_VALIDATION_COMMAND_GATE.md
docs/runtime/CODEMIND_PR_PREPARATION.md
docs/runtime/CODEMIND_GITHUB_WRITE_PROPOSAL.md
docs/runtime/CODEMIND_APPROVED_GITHUB_WRITE_GATE.md
docs/runtime/CODEMIND_RUNTIME_WORKFLOW_COMPOSITION.md
docs/runtime/CODEMIND_AJNA_WORKFLOW_SURFACE.md
docs/runtime/CODEMIND_RUNTIME_STATUS_DASHBOARD.md
docs/runtime/CODEMIND_APPROVED_LOCAL_FILE_WRITES.md
docs/ajna/CODEMIND_AJNA_DOCS_HUB.md
docs/ajna/CODEMIND_AJNA_ROADMAP.md
docs/ajna/CODEMIND_AJNA_BUILD_PLAN.md
docs/ajna-fixture-command-index.md
docs/ajna-docs-command.md
docs/ajna-client-pipeline-manifest-command.md
docs/ajna-client-pipeline-status-command.md
docs/ajna-client-collector-fixture-command.md
docs/ajna-review-pr-client-collector-fixture-command.md
docs/ajna-merge-readiness-client-collector-fixture-command.md
docs/build-state/CODEMIND_BUILD_LEDGER.md
docs/context/CODEMIND_PROJECT_CONTEXT_KERNEL.md
docs/roadmap/CODEMIND_100_PERCENT_BUILD_PLAN.md
```

## Relationship to AELIB-X1YA0I

CodeMind was extracted from earlier AELIB-side coding-agent planning work, but it is now developed as its own standalone platform.

AELIB-X1YA0I may later integrate CodeMind through a thin governed external adapter.

CodeMind should be able to work on any authorized repository, not only AELIB-X1YA0I.

## Taglines

```txt
CodeMind: Build. Fix. Understand.
Ajna: See beyond the code.
GitHub / PR Review: Expand your vision beyond the diff.
```
