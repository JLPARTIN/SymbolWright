# SymbolWright Public API Reference

SymbolWright exposes a provider-neutral API surface so any browser, LLM, coding agent, or external client can submit missions without learning provider-specific SDKs.

## Live implementation

`symbolwright serve` starts one real HTTP server on one port (`src/app/server/unified-server.ts`) implementing the chat + provider routes below, plus the unified app shell at `/` (Dashboard, Workspace, Agent, Tools, Memory, Checkpoints, Settings — all one page, hash-routed). See [`SYMBOLWRIGHT_CHAT_SERVER.md`](runtime/SYMBOLWRIGHT_CHAT_SERVER.md) for setup, auth, and deployment notes.

Governed tool execution is live today over two transports: `POST /api/agent` (HTTP+SSE, this server) runs the real `symbolwright agent` tool-execution loop; `symbolwright mcp-server` (see [`runtime/SYMBOLWRIGHT_MCP_SERVER.md`](runtime/SYMBOLWRIGHT_MCP_SERVER.md)) exposes the same tool registry to any MCP-compatible LLM client over stdio. Both are gated by the same runtime-mode policy as everywhere else in SymbolWright.

`/api/missions`, `/api/tools/run`, `/api/sessions/:id`, and `/api/missions/:id/events` remain contract-only in `src/api/universal-api-contract.ts` — they describe a further target shape (persisted sessions, a single tool-call-at-a-time HTTP primitive, PR/audit integration) that `/api/agent` doesn't cover yet.

## Security model

External clients authenticate to SymbolWright with a `SYMBOLWRIGHT_API_KEY`.

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
| `POST` | `/api/repository/pull-request` | Yes | Live | Create a real draft PR via the GitHub API (branch + commit + PR, no local push needed). Requires `{ confirm: true }` and `GITHUB_TOKEN`. |
| `POST` | `/api/missions` | Yes | Contract only | Create a governed SymbolWright mission (full agent/tool-use runtime over HTTP — not yet implemented). |
| `POST` | `/api/tools/run` | Yes | Contract only | Run a governed tool through policy, approval, audit, and redaction gates. |
| `GET` | `/api/sessions/:id` | Yes | Contract only | Read a persisted mission session and audit-safe state. |
| `GET` | `/api/missions/:id/events` | Yes | Contract only | Stream mission events, tool output, terminal-safe logs, and PR readiness updates. |

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
