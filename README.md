<p align="center">
  <img src="assets/codemind-logo.png" alt="CodeMind" width="900"/>
</p>

<p align="center">
  <strong>Standalone AI coding-agent platform for repository intelligence, direct code work, PR review, and merge-readiness.</strong>
</p>

CodeMind is a direct-capable coding-agent platform with optional governance and forensic review features. Its runtime strictness is controlled by the active runtime mode, not by a hardcoded read-only personality.

Ajna Review Cortex is the native forensic review capability. Ajna gives CodeMind deterministic review, risk, evidence, and merge-readiness reporting when those workflows are requested or required.

## Getting Started

Install and build once:

```bash
npm install
npm run build
```

Set at least one provider credential (see [`docs/PROVIDER_KEYS.md`](docs/PROVIDER_KEYS.md) for the full list — OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, GitHub Models, Ollama, DeepSeek, or a custom OpenAI-compatible endpoint):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Then pick how you want to use it — CodeMind runs the same way from all four surfaces below:

**Terminal** — direct CLI usage:

```bash
node dist/cli.js agent --mode APPROVED_EXECUTION "fix the failing tests"
```

**Browser** — one app, one port: a Dashboard, the Universal Polyglot Workspace editor, and a chat/Agent tab with an "Agent mode" toggle for real file reads/edits and shell commands, all as tabs in the same page. No provider key required to get started — pick **Browser-only mode** in the Agent tab for local diagnostics only, or **API-backed mode** to bring your own provider key. Editing code in the Workspace tab and picking an AI task (explain, review, translate, ...) switches straight to the Agent tab with the draft pre-filled — no separate page or port:

```bash
export CODEMIND_API_KEY=pick-your-own-access-key
npm run serve
# open http://127.0.0.1:8787, connect with CODEMIND_API_KEY, choose Browser-only or API-backed mode
```

See [`docs/runtime/CODEMIND_CHAT_SERVER.md`](docs/runtime/CODEMIND_CHAT_SERVER.md). Running in GitHub Codespaces? Full copy-paste setup, port-forwarding, and troubleshooting steps are in [`docs/codespaces.md`](docs/codespaces.md).

**Any MCP-compatible LLM client** (Claude Desktop, Claude Code, other agent frameworks) — add CodeMind as a plugin:

```json
{
  "mcpServers": {
    "codemind": { "command": "node", "args": ["/absolute/path/to/CodeMind/dist/cli.js", "mcp-server"] }
  }
}
```

Defaults to `READ_ONLY`; add `"--mode", "APPROVED_EXECUTION"` to the `args` array to allow file writes and shell commands. See [`docs/runtime/CODEMIND_MCP_SERVER.md`](docs/runtime/CODEMIND_MCP_SERVER.md).

**Any other LLM, script, or agent framework over plain HTTP** — `codemind serve` also exposes `/api/chat` (streaming chat) and `/api/agent` (the full tool-execution loop) as bearer-authenticated HTTP+SSE endpoints. See [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) and [`docs/USING_CODEMIND_FROM_ANY_LLM.md`](docs/USING_CODEMIND_FROM_ANY_LLM.md).

## Current State

All 20 runtime phases (A–T) are complete. The platform supports scanning, context building, direct agent execution, proposal workflows, local file writes, validation, GitHub write preparation/execution, PR review, merge-readiness, handoff generation, and audit/trace replay.

`codemind status` reports runtime build state. `codemind doctor` validates workspace health. `codemind release-readiness` checks the release gates.

## Runtime Modes

CodeMind uses one canonical runtime-mode set:

```txt
PLAN_ONLY
READ_ONLY
PROPOSAL_ONLY
APPROVED_EXECUTION
```

`APPROVED_EXECUTION` is the direct execution mode. It allows local writes, shell execution, validation commands, git operations, provider/network access, and GitHub writes when the matching credentials and tool surfaces are available.

`PLAN_ONLY`, `READ_ONLY`, and `PROPOSAL_ONLY` remain available when the operator wants non-mutating planning, inspection, or patch proposal behavior.

Mode selection:

```bash
codemind agent --mode APPROVED_EXECUTION "fix the failing tests"
codemind agent --mode READ_ONLY "inspect the repo for stale docs"
codemind agent --mode PROPOSAL_ONLY "draft the patch without applying it"
codemind agent --mode PLAN_ONLY "make a plan only"
```

Aliases:

```bash
codemind agent --approved "run direct implementation"
codemind agent --read-only "inspect only"
codemind agent --proposal-only "draft only"
codemind agent --plan-only "plan only"
```

Environment/config support:

```bash
CODEMIND_RUNTIME_MODE=APPROVED_EXECUTION
CODEMIND_RUNTIME_MODE=READ_ONLY
CODEMIND_RUNTIME_MODE=PROPOSAL_ONLY
CODEMIND_RUNTIME_MODE=PLAN_ONLY
```

The aliases `direct`, `off`, and `approved` normalize to `APPROVED_EXECUTION`. They do not create a second mode system.

## CLI Surface

The active CLI package is `codemind` and exposes:

```txt
codemind help
codemind status
codemind operator [mission]
codemind agent [--mode <mode>] [message]
codemind sessions
codemind index [dir]
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
codemind live-read-policy <json-file>
codemind live-read-client-fixture <json-file>
codemind github-live-read <json-file>
codemind ajna-live-read <json-file>
codemind operator-review <json-file>
codemind write-intent <json-file>
codemind local-write <json-file>
codemind apply-patch <json-file>
codemind validation-command <json-file>
codemind pr-preparation <json-file>
codemind github-write-proposal <json-file>
codemind github-write-gate <json-file>
codemind github-write-executor <json-file>
codemind workflow <json-file>
codemind ajna-workflow <json-file>
codemind repair-loop <json-file>
codemind runtime-status
codemind project-context [dir]
codemind scan [dir]
codemind preflight [changed-file...]
codemind mission-packet <json-file>
codemind audit-ledger <json-file>
codemind trace-store <json-file>
codemind build-ledger
codemind doctor
codemind version
codemind release-readiness
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
codemind serve [--host <host>] [--port <port>] [--cors-origin <origin>]
codemind mcp-server [--mode <mode>]
```

## Direct Agent Usage

Use the agent command for normal implementation work:

```bash
codemind agent --mode APPROVED_EXECUTION "implement the requested fix and validate it"
```

In direct mode, CodeMind should prefer useful completed work over approval theater. It can still use Ajna, audit ledgers, and governance analysis when the task asks for forensic review, release proof, or merge-readiness evidence.

## Non-Mutating Workflows

Use these when you want planning or evidence without mutation:

```bash
codemind plan "add runtime mode docs"
codemind read README.md
codemind search runtime
codemind validation-plan "runtime activation"
codemind propose-patch "draft the change only"
codemind ci-review "local fixture"
```

The legacy `codemind runtime run` path remains a bounded read-only runtime workflow. It is separate from the direct `codemind agent` surface.

## Hard Safety Rails

Governance is optional by mode, but hard safety rails remain part of the runtime boundary:

```txt
workspace boundary enforcement
protected path blocking for .git, .env, .env.local, node_modules, dist, and coverage
secret redaction in audit/trace outputs
destructive shell-command blocking
sandboxed command execution with fail-closed behavior
protected branch and force-push blocking
GitHub write credential checks
bounded validation and release-readiness gates
```

These rails are not approval theater. They prevent accidental repo damage while keeping CodeMind useful as a direct coding agent.

## Platform Capabilities

CodeMind can:

```txt
understand repository structure
load project instructions
scan code and docs
plan implementation work
perform direct implementation through codemind agent
propose patches without applying them
write allowed local files
run validation commands
diagnose CI failures
prepare PR summaries
create and evaluate GitHub write operations
review pull requests
assess merge-readiness
coordinate specialized capabilities such as Ajna Review Cortex
support Codespaces/operator runbooks
record and replay audit trails with secret redaction
generate agent kernel mission handoff packets
validate workspace health and release readiness
recall and store durable episodic, lexical, and procedural memory across agent turns
run sandboxed PR preflight evidence checks and block pushes on regression
serve a real browser chat UI + HTTP API against any registered provider (`codemind serve`, see docs/runtime/CODEMIND_CHAT_SERVER.md)
run the real tool-execution agent loop over HTTP for Anthropic and any OpenAI-compatible provider, mode-gated (`POST /api/agent` on `codemind serve`)
run itself as a real MCP server so any MCP-compatible LLM client can use its tools as a plugin (`codemind mcp-server`, see docs/runtime/CODEMIND_MCP_SERVER.md)
```

Ajna remains evidence-first:

```txt
PR evidence schema
local collector fixtures
offline API payload adapter
collector snapshot contract
review-pr normalization
merge-readiness reporting
client pipeline manifest/status checks
live read adapters behind runtime policy checks
```

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
npm run release-readiness
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
npm run validate      audit + typecheck + lint + format + coverage + build + release-readiness
```

## CI Strategy

Normal PR validation runs on Node 22 for one clear required signal. Node 20 and Node 22 compatibility proof lives in the separate `Node Compatibility` workflow, which can be run manually or on schedule.

## Current Foundation Docs

```txt
docs/migration/AELIB_CODEMIND_EXTRACTION_NOTES.md
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
docs/runtime/CODEMIND_GITHUB_LIVE_READ_V1.md
docs/runtime/CODEMIND_AJNA_LIVE_READ_PIPELINE.md
docs/runtime/CODEMIND_OPERATOR_REVIEW_GATE.md
docs/runtime/CODEMIND_APPROVED_WRITE_PREPARATION.md
docs/runtime/CODEMIND_CONTROLLED_LOCAL_FILE_WRITE_GATE.md
docs/runtime/CODEMIND_APPROVED_VALIDATION_COMMAND_GATE.md
docs/runtime/CODEMIND_APPROVED_VALIDATION_EXECUTION.md
docs/runtime/CODEMIND_PR_PREPARATION.md
docs/runtime/CODEMIND_GITHUB_WRITE_PROPOSAL.md
docs/runtime/CODEMIND_APPROVED_GITHUB_WRITE_GATE.md
docs/runtime/CODEMIND_RUNTIME_WORKFLOW_COMPOSITION.md
docs/runtime/CODEMIND_AJNA_WORKFLOW_SURFACE.md
docs/runtime/CODEMIND_RUNTIME_STATUS_DASHBOARD.md
docs/runtime/CODEMIND_APPROVED_LOCAL_FILE_WRITES.md
docs/runtime/CODEMIND_SANDBOX_PRODUCTION_HARDENING.md
docs/runtime/CODEMIND_MCP_TOOL_RUNTIME.md
docs/runtime/CODEMIND_MCP_SERVER.md
docs/runtime/CODEMIND_WEB_TOOLS.md
docs/runtime/CODEMIND_CHAT_SERVER.md
docs/runtime/CODEMIND_CHECKPOINT_REWIND.md
docs/ajna/CODEMIND_AJNA_DOCS_HUB.md
docs/ajna/CODEMIND_AJNA_ROADMAP.md
docs/ajna/CODEMIND_AJNA_BUILD_PLAN.md
docs/build-state/CODEMIND_BUILD_LEDGER.md
docs/build-state/CODEMIND_FINAL_FORENSIC_AUDIT.md
docs/autonomy/AGENT_FORENSIC_PROCESS_DOCUMENTATION.md
docs/context/CODEMIND_PROJECT_CONTEXT_KERNEL.md
```

Some historical docs still use approval-era names because they describe earlier runtime phases or migration notes. Current behavior is controlled by the runtime mode selected for the active command.

## Relationship to AELIB-X1YA0I

CodeMind was extracted from earlier AELIB-side coding-agent planning work, but it is now developed as its own standalone platform.

AELIB-X1YA0I may later integrate CodeMind through a thin external adapter.

CodeMind should be able to work on any authorized repository, not only AELIB-X1YA0I.

## Taglines

```txt
CodeMind: Build. Fix. Understand.
Ajna: See beyond the code.
GitHub / PR Review: Expand your vision beyond the diff.
```
