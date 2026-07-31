# SymbolWright Public API Reference

SymbolWright exposes a provider-neutral API surface so any browser, LLM, coding agent, or external client can submit missions without learning provider-specific SDKs.

## Live implementation

`symbolwright serve` starts one real HTTP server on one port (`src/app/server/unified-server.ts`) implementing the chat + provider routes below, plus the unified app shell at `/` (Dashboard, Workspace, Agent, Tools, Memory, Checkpoints, Settings — all one page, hash-routed). See [`SYMBOLWRIGHT_CHAT_SERVER.md`](runtime/SYMBOLWRIGHT_CHAT_SERVER.md) for setup, auth, and deployment notes.

Governed tool execution is live today over two transports: `POST /api/agent` (HTTP+SSE, this server) runs the real `symbolwright agent` tool-execution loop; `symbolwright mcp-server` (see [`runtime/SYMBOLWRIGHT_MCP_SERVER.md`](runtime/SYMBOLWRIGHT_MCP_SERVER.md)) exposes the same tool registry to any MCP-compatible LLM client over stdio. Both are gated by the same runtime-mode policy as everywhere else in SymbolWright.

`/api/missions`, `/api/tools/run`, `/api/sessions/:id`, and `/api/missions/:id/events` remain contract-only in `src/api/universal-api-contract.ts` — they describe a further target shape (persisted sessions, a single tool-call-at-a-time HTTP primitive, PR/audit integration) that `/api/agent` doesn't cover yet.

## Security model

External clients authenticate to SymbolWright with a `SYMBOLWRIGHT_API_KEY`, which grants full,
unrestricted local-operator access — intended for the operator's own tools and dashboard, not for
handing to an external LLM or coding agent. External agents should instead be issued a scoped
`sw_agent_...` credential through the delegated-agent-access system (below) — see
[`docs/security/DELEGATED_AGENT_ACCESS.md`](security/DELEGATED_AGENT_ACCESS.md) for the full
capability/scope/approval model. Every `/api/*` route accepts either credential in the same
`Authorization: Bearer ...` header; an agent token is restricted to its grant's exact capabilities,
repositories, and branch patterns, re-checked on every request.

Provider credentials stay behind SymbolWright:

- long-lived provider keys are stored in the server-side provider vault;
- request-scoped keys are accepted only by the server runtime;
- browser clients never call OpenAI, Anthropic, Gemini, Groq, OpenRouter, GitHub Models, Ollama, DeepSeek, or custom providers directly.

```txt
Browser / ChatGPT / Claude / Gemini / Cursor / Cline / Codex
        ↓
SymbolWright Public API
        ↓
SymbolWright Runtime + Policy + Audit
        ↓
Provider Adapter
```

## Routes

| Method | Path | Auth | Status | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/` | No | Live | Unified app shell — Dashboard, Workspace, Agent, Tools, Memory, Checkpoints, Settings as tabs in one page. |
| `GET` | `/workspace` | No | Live | Redirects (302) to `/#/workspace` — bookmark compatibility with the pre-unification standalone route. |
| `GET` | `/api/health` | No | Live | Unauthenticated liveness check. |
| `GET` | `/api/status` | Yes | Live | Runtime status cards (doctor/release-readiness/runtime-phase/tool-registry state). |
| `GET` | `/api/workspace/languages` | Yes | Live | Universal Workspace language/runner registry. |
| `POST` | `/api/workspace/run` | Yes | Live | Run code through a server-side runner (e.g. TypeScript). |
| `POST` | `/api/workspace/intelligence` | Yes | Live | Prepare a code-intelligence draft (generate/explain/translate/review/tests/drift) for the Agent tab. |
| `GET` | `/api/providers` | Yes | Live | List provider catalog, redacted config, and configured/missing status. |
| `POST` | `/api/providers/register` | Yes | Live | Register or override a provider's base URL, API key, or model at runtime — this is how you point SymbolWright at any API you choose. |
| `POST` | `/api/providers/reset` | Yes | Live | Clear a runtime provider override back to its env-configured defaults. |
| `POST` | `/api/providers/test` | Yes | Live | Verify provider adapter readiness without exposing provider keys to the browser. |
| `POST` | `/api/chat` | Yes | Live | Send a conversational chat turn; set `"stream": true` for a server-sent-events token stream. |
| `POST` | `/api/agent` | Yes | Live | Run the real tool-execution agent loop (read/search/edit files, run commands, etc., mode-gated); set `"stream": true` (default) for a live SSE event stream. |
| `GET` | `/api/tools` | Yes | Live | The real tool registry: statically-assembled tools with per-mode reachability, plus the separately-listed dynamically-wired tools. |
| `GET` | `/api/memory/recent` | Yes | Live | Recent episodic memory interactions (read-only). |
| `GET` | `/api/memory/procedural` | Yes | Live | Procedural memory rules by category (read-only). |
| `GET` | `/api/checkpoints` | Yes | Live | Checkpoints created before mutating file writes. |
| `GET` | `/api/checkpoints/:id` | Yes | Live | One checkpoint's full metadata by id. |
| `GET` | `/api/repository/tree` | Yes | Live | One directory level of the real checked-out working tree (`?dir=`, default root). |
| `GET` | `/api/repository/file` | Yes | Live | Real file content plus a `contentHash` for optimistic-concurrency conflict detection on save (`?path=`). |
| `PUT` | `/api/repository/file` | Yes | Live | Write a real file through the checkpoint-bound guarded write path. `baseContentHash` triggers a 409 with the current on-disk content if the file changed since it was loaded. |
| `GET` | `/api/repository/status` | Yes | Live | Structured git status (staged/unstaged/untracked/conflicted) plus the current branch. |
| `GET` | `/api/repository/diff` | Yes | Live | Raw unified diff for one file or the whole tree (`?path=&staged=`). |
| `GET` | `/api/repository/branches` | Yes | Live | Local branches plus which one is current. |
| `POST` | `/api/repository/branches` | Yes | Live | Create and switch to a new branch (`{ name }`); blocked on protected refs (`main`/`master`/`production`/`release`). |
| `POST` | `/api/repository/commit` | Yes | Live | Stage the given `files` (or everything, excluding `.symbolwright/`, when omitted) and commit with `message`. |
| `POST` | `/api/repository/checkpoints/:id/restore` | Yes | Live | Restore a checkpoint's snapshotted files back into the real working tree (hash-verified per file). |
| `POST` | `/api/repository/push` | Yes | Live | Push the current branch. Requires `{ confirm: true }`; blocked on protected branches and force pushes (no force option is exposed to the client at all). |
| `POST` | `/api/repository/pull-request` | Yes | Live | Create a real draft PR via the GitHub API (branch + commit + PR, no local push needed). Requires `{ confirm: true }` and a GitHub credential — a configured GitHub App installation token (preferred) or `GITHUB_TOKEN`. |
| `POST` | `/api/sandbox/dependencies/npm` | Yes | Live | Governed npm dependency acquisition for a server-resolved `missionId`, brokered through the operator's `defaultDependencyPolicy` (operator) or the caller's bound dependency policy reference (delegated grant). See [`docs/security/SANDBOX_NETWORK_GATEWAY_COMPOSITION.md`](security/SANDBOX_NETWORK_GATEWAY_COMPOSITION.md). |
| `POST` | `/api/sandbox/egress` | Yes | Live | Governed brokered HTTPS egress for a server-resolved `missionId` — bounded `url`/`method`/`headers`/`body`/`limits` only, redacted response (hostname + path hash, never raw query/URL). Same operator/delegated policy model as dependency acquisition. See [`docs/security/SANDBOX_NETWORK_GATEWAY_COMPOSITION.md`](security/SANDBOX_NETWORK_GATEWAY_COMPOSITION.md). |
| `GET` | `/api/sandbox/network-status` | Operator | Live | Redacted sandbox network control-plane summary — mode, dependency/egress policy inventory, default policy references, and live egress metrics. 404s (not 403) for a non-operator caller. Never returns state-root/policy-file paths or credentials. |
| `POST` | `/api/missions` | Yes | Contract only | Create a governed SymbolWright mission (full agent/tool-use runtime over HTTP — not yet implemented). |
| `POST` | `/api/tools/run` | Yes | Contract only | Run a governed tool through policy, approval, audit, and redaction gates. |
| `GET` | `/api/sessions/:id` | Yes | Contract only | Read a persisted mission session and audit-safe state. |
| `GET` | `/api/missions/:id/events` | Yes | Contract only | Stream mission events, tool output, terminal-safe logs, and PR readiness updates. |

## Delegated Agent Access routes

Full model: [`docs/security/DELEGATED_AGENT_ACCESS.md`](security/DELEGATED_AGENT_ACCESS.md). Grant
management routes require the operator's `SYMBOLWRIGHT_API_KEY`; an agent token cannot manage
grants, including its own.

| Method | Path | Auth | Status | Purpose |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/access-grants` | Operator | Live | Create a scoped agent grant; returns the plaintext credential once. |
| `GET` | `/api/v1/access-grants` | Operator | Live | List all grants. |
| `GET` | `/api/v1/access-grants/:id` | Operator | Live | Grant detail: effective permissions, credentials (metadata only), pending approvals. |
| `PATCH` | `/api/v1/access-grants/:id` | Operator | Live | Narrow a grant only — add denied capabilities, shorten (never extend) `expiresAt`, tighten limits, update `displayName`/`reason`. Cannot add a capability or widen scope. |
| `POST` | `/api/v1/access-grants/:id/pause` | Operator | Live | Pause a grant — every session invalidated immediately, reversible. |
| `POST` | `/api/v1/access-grants/:id/resume` | Operator | Live | Resume a paused (not revoked, not expired) grant. |
| `POST` | `/api/v1/access-grants/:id/revoke` | Operator | Live | Revoke permanently — every session and credential invalidated immediately, irreversible. |
| `POST` | `/api/v1/access-grants/:id/rotate` | Operator | Live | Revoke the current credential and issue a new one (returned once). |
| `DELETE` | `/api/v1/access-grants/:id` | Operator | Live | Delete a grant record. |
| `POST` | `/api/v1/device-authorization` | No (device-flow) | Live | Agent requests a device code + short operator-facing `userCode`. |
| `POST` | `/api/v1/device-authorization/approve` | Operator | Live | Approve a pending device request by `userCode`, issuing a grant. |
| `POST` | `/api/v1/device-authorization/deny` | Operator | Live | Deny a pending device request. |
| `GET` | `/api/v1/device-authorization/pending` | Operator | Live | List pending device requests. |
| `POST` | `/api/v1/oauth/token` | No (device-flow) | Live | Agent polls with `{ device_code }`; returns the token once approved. |
| `GET` | `/api/v1/permissions/catalog` | Operator or agent | Live | The full capability taxonomy with risk levels. |
| `GET` | `/api/v1/permissions/profiles` | Operator or agent | Live | The built-in permission profiles. |
| `GET` | `/api/v1/audit/agent-access` | Operator | Live | Audit event log, optionally filtered by `?grantId=`. |

An agent-token-authenticated request to any other route not explicitly capability-mapped in
`src/access/route-capability-map.ts` receives `403 { reasonCode: 'ROUTE_NOT_PERMITTED' }` — new
routes are unreachable by agents until deliberately added to that allowlist.

## Agent Team routes (multi-agent orchestration)

Full model: [`docs/autonomy/MULTI_AGENT_ENGINEERING_ORCHESTRATION.md`](autonomy/MULTI_AGENT_ENGINEERING_ORCHESTRATION.md).
Unlike the generic route-capability-map above, every `/api/v1/agent-teams/*` handler
(`src/app/api/agent-team-routes.ts`) re-authorizes itself inline against the exact
`orchestration.*` capability the operation needs — the same pattern `access-routes.ts` uses. The
operator (`SYMBOLWRIGHT_API_KEY`) is always authorized; an agent-token principal needs the listed
capability on its own grant.

| Method | Path | Capability | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/v1/agent-teams` | `orchestration.team.manage` | Form a new team for a mission. |
| `GET` | `/api/v1/agent-teams` | `orchestration.team.read` | List teams. |
| `GET` | `/api/v1/agent-teams/:teamId` | `orchestration.team.read` | Team detail: members, tasks, candidates. |
| `POST` | `/api/v1/agent-teams/:teamId/{start,pause,resume,cancel}` | `orchestration.team.manage` | Lifecycle transitions. |
| `POST` | `/api/v1/agent-teams/:teamId/members` | `orchestration.team.manage` | Add a member — mints a real, independently revocable `AgentAccessGrant`. |
| `DELETE` | `/api/v1/agent-teams/:teamId/members/:memberId` | `orchestration.team.manage` | Remove a member — revokes its grant immediately. |
| `GET` | `/api/v1/agent-teams/:teamId/tasks` | `orchestration.team.read` | List the team's collaborative tasks. |
| `POST` | `/api/v1/agent-teams/:teamId/tasks` | `orchestration.team.manage` | Create a task. |
| `POST` | `/api/v1/agent-teams/:teamId/tasks/:taskId/assign` | `orchestration.task.assign` | Score and assign eligible members. |
| `GET` | `/api/v1/agent-teams/:teamId/candidates` | `orchestration.team.read` | List change candidates. |
| `POST` | `/api/v1/agent-teams/:teamId/candidates/:candidateId/review` | `orchestration.review.submit` | Submit a peer review (self-review is refused). |
| `POST` | `/api/v1/agent-teams/:teamId/candidates/:candidateId/{accept,reject}` | `orchestration.review.submit` | Decide a candidate — `accept` requires an independent approval with no open blocking findings. |
| `POST` | `/api/v1/agent-teams/:teamId/integrations` | `orchestration.integration.request` | Prepare an integration plan (conflict detection, dependency ordering). |
| `POST` | `/api/v1/agent-teams/:teamId/integrations/:planId/execute` | `orchestration.integration.request` | Apply + validate; rolls back on any failure. |
| `POST` | `/api/v1/agent-teams/:teamId/integrations/:planId/rollback` | `orchestration.integration.request` | Explicit rollback to the plan's captured base SHA. |
| `GET` | `/api/v1/agent-teams/:teamId/events` | `orchestration.team.read` | The team's audit trail. |
| `GET` | `/api/v1/agent-roles` | none (any authenticated principal) | The built-in role catalog. |

## Mission request shape

```json
{
  "client": "browser",
  "provider": "openai",
  "repo": "JLPARTIN/SymbolWright",
  "mission": "Run a forensic audit and generate large PR bundles.",
  "stream": true
}
```

Supported client values:

- `browser`
- `chatgpt`
- `claude`
- `gemini`
- `cursor`
- `cline`
- `codex`
- `api-client`

Supported provider values:

- `openai`
- `anthropic`
- `google-gemini`
- `groq`
- `openrouter`
- `github-models`
- `ollama`
- `deepseek`
- `custom`

## Contract source of truth

The source contract lives in:

- `src/api/universal-api-contract.ts`
- `src/providers/provider-adapter-contract.ts`
- `src/workspace/browser-workspace-contract.ts`

Release-readiness must fail if this contract is removed or weakened.
