# CodeMind

**Standalone AI coding-agent platform for repository intelligence, safe code work, PR review, and merge-readiness.**

CodeMind is being built as a governed coding-agent platform. It starts read-only and plan-first, then grows toward approved code edits, validation, CI diagnosis, PR preparation, and merge-readiness workflows.

Ajna Review Cortex is the first native CodeMind capability. Ajna gives CodeMind a deterministic review layer for pull-request evidence, local fixture pipelines, and merge-readiness reporting before live provider or live GitHub mutation work is introduced.

## Current State

CodeMind currently has a TypeScript CLI foundation with Vitest coverage, active read-only runtime commands, proposal-mode output, a bounded read-only runtime loop, approval-gated dry-run execution, local PR/CI fixture read adapters, and a read-only Ajna workflow surface.

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
docs/runtime/CODEMIND_RUNTIME_READONLY_COMMANDS.md
docs/runtime/CODEMIND_PROPOSAL_MODE.md
docs/runtime/CODEMIND_READONLY_LOOP.md
docs/runtime/CODEMIND_APPROVED_EXECUTION_GATES.md
docs/runtime/CODEMIND_LIVE_READ_ADAPTERS.md
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
