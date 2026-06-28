# CodeMind Public API Reference

CodeMind exposes a provider-neutral API surface so any browser, LLM, coding agent, or external client can submit missions without learning provider-specific SDKs.

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

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/missions` | Create a governed CodeMind mission. |
| `POST` | `/api/chat` | Send a conversational mission turn. |
| `POST` | `/api/tools/run` | Run a governed tool through policy, approval, audit, and redaction gates. |
| `POST` | `/api/providers/test` | Verify provider adapter readiness without exposing provider keys to the browser. |
| `GET` | `/api/sessions/:id` | Read a persisted mission session and audit-safe state. |
| `GET` | `/api/missions/:id/events` | Stream mission events, tool output, terminal-safe logs, and PR readiness updates. |

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
