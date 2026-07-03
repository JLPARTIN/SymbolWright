# CodeMind Chat Server (`codemind serve`)

A real HTTP server and browser chat UI, backed by the provider gateway
(`src/providers/provider-gateway.ts`). This is the "bring your own API key,
use it from a browser" surface: pick any of the preset providers or register
a fully custom OpenAI-compatible endpoint, then chat from `/` like any other
LLM web client. Provider credentials stay on the server; the browser only
ever holds the `CODEMIND_API_KEY`.

```txt
Browser  →  CodeMind Chat API (auth: CODEMIND_API_KEY)  →  Provider Gateway  →  Provider API
```

## Start it

```bash
CODEMIND_API_KEY=your-own-access-key codemind serve
```

Starting fails closed if `CODEMIND_API_KEY` is unset or blank — there is no
default key.

Flags (all optional, env vars are the fallback):

```txt
--host <host>              default 127.0.0.1, env CODEMIND_CHAT_HOST
--port <port>              default 8787, env CODEMIND_CHAT_PORT
--cors-origin <origin>     env CODEMIND_CORS_ORIGIN (only needed if the UI is hosted on a different origin than the API)
```

TLS: set `CODEMIND_TLS_CERT_FILE` and `CODEMIND_TLS_KEY_FILE` to terminate
TLS directly in the Node process. If you bind to a non-loopback host without
these set, the server still starts but prints a warning recommending you put
a TLS-terminating reverse proxy (Caddy, nginx, Cloudflare Tunnel, etc.) in
front of it before exposing it on the public internet.

## Routes

See the live-route table in [`../API_REFERENCE.md`](../API_REFERENCE.md).
Every route under `/api/*` except `/api/health` requires
`Authorization: Bearer <CODEMIND_API_KEY>`.

## Put an API from wherever you want

`POST /api/providers/register` accepts any of the eight provider ids
(`openai`, `anthropic`, `google-gemini`, `groq`, `openrouter`,
`github-models`, `ollama`, `custom`) plus a `baseUrl`, `apiKey`, and `model`
override. Use `custom` to point at any OpenAI-compatible endpoint you run or
subscribe to — a self-hosted vLLM/LM Studio server, a proxy, or another
vendor's compatibility layer:

```bash
curl -X POST http://127.0.0.1:8787/api/providers/register \
  -H "Authorization: Bearer $CODEMIND_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "providerId": "custom",
    "baseUrl": "https://my-model-host.example.com/v1",
    "apiKey": "sk-my-key",
    "model": "my-model"
  }'
```

Overrides live in memory only (`ProviderRuntimeOverrideStore`) and are lost
on restart — re-register after redeploying, or set the matching
`*_API_KEY`/`CODEMIND_OPENAI_COMPATIBLE_*` env vars instead if you want a
provider preconfigured at boot (see
[`../PROVIDER_KEYS.md`](../PROVIDER_KEYS.md)).

## Chat

```bash
curl -X POST http://127.0.0.1:8787/api/chat \
  -H "Authorization: Bearer $CODEMIND_API_KEY" -H "Content-Type: application/json" \
  -d '{"providerId": "custom", "messages": [{"role": "user", "content": "hi"}]}'
```

Set `"stream": true` to get a `text/event-stream` response with `data:
{"delta": "..."}` frames as the model generates, ending in `event: done`.
Real token-level streaming is implemented for the OpenAI-compatible family
(`openai`, `groq`, `openrouter`, `github-models`, `ollama`, `custom`) and for
`anthropic`. `google-gemini` currently falls back to one full-text chunk
followed by `done` — true incremental streaming for Gemini is not yet wired
up.

## What this is not (yet)

This server runs conversational chat turns through the provider gateway. It
does not run the `codemind agent` mission/tool-use runtime over HTTP — no
file edits, shell commands, or PR preparation happen through `/api/chat`.
Wiring the full coding-agent runtime (with tool use, approvals, and audit)
into this API is tracked separately; see the "Contract only" rows in
[`../API_REFERENCE.md`](../API_REFERENCE.md).

## Using it as a plugin from another LLM

Because `/api/chat` is a plain authenticated HTTP+SSE endpoint, any LLM
client or agent framework that can make HTTP calls can drive it — point an
MCP-compatible client, a custom GPT action, or a script at this server the
same way the browser UI does. A native MCP *server* wrapper (so tools like
Claude Desktop can add CodeMind as a one-click connector) is the next planned
phase; see `docs/USING_CODEMIND_FROM_ANY_LLM.md`.
