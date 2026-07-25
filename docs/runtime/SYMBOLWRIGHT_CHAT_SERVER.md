# CodeMind Chat/Agent API (`codemind serve`)

A real HTTP server backed by the provider gateway
(`src/providers/provider-gateway.ts`). This is the "bring your own API key,
use it from a browser" surface: pick any of the preset providers or register
a fully custom OpenAI-compatible endpoint, then chat from the **Agent** tab
of the unified app shell (`/`, then `#/agent`) like any other LLM web
client. Provider credentials stay on the server; the browser only ever
holds the `CODEMIND_API_KEY`. `codemind serve` starts one process on one
port serving this API alongside the Dashboard, Workspace, Tools, Memory,
and Checkpoints tabs — see [`../codespaces.md`](../codespaces.md) for the
full app.

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

`POST /api/providers/register` accepts any of the nine provider ids
(`openai`, `anthropic`, `google-gemini`, `groq`, `openrouter`,
`github-models`, `ollama`, `deepseek`, `custom`) plus a `baseUrl`, `apiKey`,
and `model` override. Use `custom` to point at any OpenAI-compatible endpoint
you run or subscribe to — a self-hosted vLLM/LM Studio server, a proxy, or
another vendor's compatibility layer:

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
Real token-level streaming is implemented for every supported provider:
the OpenAI-compatible family (`openai`, `groq`, `openrouter`,
`github-models`, `ollama`, `deepseek`, `custom`), `anthropic`, and
`google-gemini` (via `alt=sse` on `streamGenerateContent`).

## Agent (real tool execution)

`POST /api/agent` runs the actual `codemind agent` tool-execution loop —
the same runtime tool registry (`assembleAgentTools()`) and mode-gated
policy as `codemind agent` and `codemind mcp-server` — over HTTP, so the
model can read files, search the repo, and (in more permissive modes) edit
files, run shell commands, and more, iterating until it's done:

```bash
curl -X POST http://127.0.0.1:8787/api/agent \
  -H "Authorization: Bearer $CODEMIND_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "providerId": "anthropic",
    "mode": "READ_ONLY",
    "message": "What does this repo do? Read the README to find out."
  }'
```

Request fields: `providerId` (required), `message` (required — the new user
turn), `mode` (`PLAN_ONLY`/`READ_ONLY`/`PROPOSAL_ONLY`/`APPROVED_EXECUTION`,
**default `READ_ONLY`**), `model`, `systemPrompt`, `temperature`,
`maxTokens`, `maxIterations` (default 25, max 100), `stream` (default
`true`), and `priorMessages` (see below).

`mode` defaults to `READ_ONLY` here, not the platform-wide
`DEFAULT_CODEMIND_RUNTIME_MODE` (`APPROVED_EXECUTION`) — the same reasoning
as `codemind mcp-server`'s default: this is a new HTTP surface any
authenticated caller can hit, so it starts narrower until the caller
explicitly asks for more via `mode`.

**Provider support**: running the tool-execution loop requires a provider
implementation that speaks that vendor's function-calling wire format, not
just plain chat completions. Every supported provider has one: `anthropic`
(native `tool_use`), the whole OpenAI-compatible family (`openai`, `groq`,
`openrouter`, `github-models`, `ollama`, `deepseek`, `custom` — they share
one `tools`/`tool_calls` format), and `google-gemini`
(`functionDeclarations`/`functionCall` — a third, distinct shape,
implemented separately in `src/provider/gemini-llm-provider.ts`). Unlike
OpenAI's incremental per-token tool-call argument streaming, Gemini emits
each function call as one complete part as soon as the model decides to
call it, so there's no partial-JSON accumulation on that path.

**Streaming** (`stream: true`, the default) emits one SSE frame per agent
event — `iteration_start`, `text_delta`, `tool_call_start`, `tool_call_end`,
`iteration_end`, `loop_end`, then a final `result` frame with the complete
`AgentLoopResult` (status, finalText, iterations, totalUsage,
`finalMessages`), then `done`. Non-streaming (`stream: false`) just returns
that same `AgentLoopResult` as a single JSON response.

**Continuing a conversation**: `finalMessages` in the result is the full
message history (including tool_use/tool_result content blocks) built up by
that run. Pass it back as `priorMessages` on your next `/api/agent` call to
continue the same conversation with tool-call context intact — the server
is otherwise stateless between calls.

### From the browser

The `/` chat page has an **Agent mode** checkbox under the chat box. Turning
it on reveals a runtime-mode selector (defaults to `READ_ONLY`) and switches
the Send button to call `/api/agent` instead of `/api/chat`: tool calls the
model makes render inline as their own transcript entries (`🔧 calling
read_file...`, then `✓ read_file → <output preview>`), and the page keeps
the returned `finalMessages` in memory so the conversation continues with
full tool-call context across turns in that browser session.

## What this is not (yet)

`/api/agent` runs real tools, but there's no session/audit persistence layer
yet (each call is a self-contained run; conversation continuity is entirely
via `priorMessages`), and PR preparation / GitHub write workflows aren't
wired into it specifically — those still go through the dedicated `codemind`
CLI commands (`codemind pr-preparation`, `codemind github-write-proposal`,
etc.) and the `codemind agent` CLI's session persistence. See the "Contract
only" rows in [`../API_REFERENCE.md`](../API_REFERENCE.md) for the fuller
mission/session/event-stream shape this is still growing toward.

## Using it as a plugin from another LLM

Because `/api/chat` and `/api/agent` are plain authenticated HTTP+SSE
endpoints, any LLM client or agent framework that can make HTTP calls can
drive them — point a custom GPT action, an agent framework, or a script at
this server the same way the browser UI does. For MCP-compatible clients
specifically (Claude Desktop, Claude Code, etc.), `codemind mcp-server` (see
[`CODEMIND_MCP_SERVER.md`](CODEMIND_MCP_SERVER.md)) is the more native
integration — see `docs/USING_CODEMIND_FROM_ANY_LLM.md` for the full picture
across both.
