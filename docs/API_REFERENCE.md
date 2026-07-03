# CodeMind Public API Reference

CodeMind exposes a provider-neutral API surface so any browser, LLM, coding agent, or external client can submit missions without learning provider-specific SDKs.

## Live implementation

`codemind serve` starts a real HTTP server (`src/server/codemind-chat-server.ts`) implementing the chat + provider routes below, plus a browser chat UI at `/`. See [`CODEMIND_CHAT_SERVER.md`](runtime/CODEMIND_CHAT_SERVER.md) for setup, auth, and deployment notes.

`/api/missions`, `/api/tools/run`, `/api/sessions/:id`, and `/api/missions/:id/events` remain contract-only in `src/api/universal-api-contract.ts` — they describe the target shape for running the full `codemind agent` mission/tool-use runtime over HTTP, which is a separate, larger phase of work not yet implemented.

Governed tool execution *is* live today over a different transport: `codemind mcp-server` (see [`runtime/CODEMIND_MCP_SERVER.md`](runtime/CODEMIND_MCP_SERVER.md)) exposes CodeMind's real runtime tools — `read_file`, `search_files`, and in more permissive modes `edit_file`, `bash`, `git`, and more — to any MCP-compatible LLM client over stdio, gated by the same runtime-mode policy as everywhere else in CodeMind. `/api/tools/run` is the HTTP-transport equivalent of that same capability and is not yet built.

## Security model

External clients authenticate to CodeMind with a `CODEMIND_API_KEY`.

Provider credentials stay behind CodeMind:

- long-lived provider keys are stored in the server-side provider vault;
- request-scoped keys are accepted only by the server runtime;
- browser clients never call OpenAI, Anthropic, Gemini, Groq, OpenRouter, GitHub Models, Ollama, or custom providers directly.

```txt
Browser / ChatGPT / Claude / Gemini / Cursor / Cline / Codex
        ↓
CodeMind Public API
        ↓
CodeMind Runtime + Policy + Audit
        ↓
Provider Adapter
```

## Routes

| Method | Path | Status | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Live | Browser chat UI. |
| `GET` | `/api/health` | Live | Unauthenticated liveness check. |
| `GET` | `/api/providers` | Live | List provider catalog, redacted config, and configured/missing status. |
| `POST` | `/api/providers/register` | Live | Register or override a provider's base URL, API key, or model at runtime — this is how you point CodeMind at any API you choose. |
| `POST` | `/api/providers/reset` | Live | Clear a runtime provider override back to its env-configured defaults. |
| `POST` | `/api/providers/test` | Live | Verify provider adapter readiness without exposing provider keys to the browser. |
| `POST` | `/api/chat` | Live | Send a conversational chat turn; set `"stream": true` for a server-sent-events token stream. |
| `POST` | `/api/missions` | Contract only | Create a governed CodeMind mission (full agent/tool-use runtime over HTTP — not yet implemented). |
| `POST` | `/api/tools/run` | Contract only | Run a governed tool through policy, approval, audit, and redaction gates. |
| `GET` | `/api/sessions/:id` | Contract only | Read a persisted mission session and audit-safe state. |
| `GET` | `/api/missions/:id/events` | Contract only | Stream mission events, tool output, terminal-safe logs, and PR readiness updates. |

## Mission request shape

```json
{
  "client": "browser",
  "provider": "openai",
  "repo": "JLPARTIN/CodeMind",
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
- `custom`

## Contract source of truth

The source contract lives in:

- `src/api/universal-api-contract.ts`
- `src/providers/provider-adapter-contract.ts`
- `src/workspace/browser-workspace-contract.ts`

Release-readiness must fail if this contract is removed or weakened.
