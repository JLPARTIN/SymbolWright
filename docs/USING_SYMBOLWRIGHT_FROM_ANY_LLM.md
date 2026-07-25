# Using SymbolWright From Any LLM

SymbolWright should be callable from any LLM or coding environment that can make an HTTP request or follow an API contract.

## What's live today

Two real integration paths exist now, covering different kinds of "any LLM":

- **HTTP** — `codemind serve` (see [`runtime/SYMBOLWRIGHT_CHAT_SERVER.md`](runtime/SYMBOLWRIGHT_CHAT_SERVER.md)) runs a real `/api/chat` endpoint (plain streaming chat) and a real `/api/agent` endpoint (the full tool-execution loop — read/search/edit files, run commands, mode-gated), both with bearer-token auth and provider registration. Any HTTP-capable client (browser, script, GPT action, agent framework) can drive them.
- **MCP** — `codemind mcp-server` (see [`runtime/SYMBOLWRIGHT_MCP_SERVER.md`](runtime/SYMBOLWRIGHT_MCP_SERVER.md)) runs SymbolWright as a real Model Context Protocol server over stdio. Any MCP-compatible client — Claude Desktop, Claude Code, or another agent framework — can add it as a plugin/connector and call its actual tools (`read_file`, `search_files`, and, in more permissive modes, `edit_file`, `bash`, `git`, GitHub write tools, and more).

The mission/event-stream contract below (`/api/missions`, `/api/missions/:id/events`) describes a further target shape — a single "mission" abstraction spanning both transports — that isn't built yet; today, drive SymbolWright through `codemind serve`'s `/api/chat` or `codemind mcp-server`'s tool calls directly.

## Client pattern

Give the external LLM this contract:

```txt
Base URL: https://symbolwright.example.com/api
Authorization: Bearer <SYMBOLWRIGHT_API_KEY>
Mission route: POST /api/missions
Events route: GET /api/missions/:id/events
```

The LLM should send SymbolWright a mission and let SymbolWright handle provider selection, repo evidence, tools, memory, validation, PR preparation, and audit trails.

## Example mission

```json
{
  "client": "chatgpt",
  "provider": "anthropic",
  "repo": "JLPARTIN/SymbolWright",
  "mission": "Inspect the current repository state, generate large PR bundles, and produce a release-readiness report.",
  "stream": true
}
```

## Recommended LLM instruction

```txt
Use SymbolWright as the coding-agent runtime. Do not directly mutate the repository. Submit the mission to SymbolWright, read the streamed events, and summarize SymbolWright's findings, validation proof, and PR readiness state.
```

## Supported clients

- ChatGPT
- Claude
- Gemini
- Cursor
- Cline
- Codex
- browser clients
- custom API clients

## Supported provider routing

SymbolWright can route through:

- OpenAI
- Anthropic
- Google Gemini
- Groq
- OpenRouter
- GitHub Models
- Ollama
- DeepSeek
- custom providers

Real tool-execution over `/api/agent` is available for every provider above: Anthropic (native `tool_use`), the whole OpenAI-compatible family (OpenAI, Groq, OpenRouter, GitHub Models, Ollama, DeepSeek, custom — one shared `tools`/`tool_calls` wire format), and Google Gemini (`functionDeclarations`/`functionCall`, implemented separately in `src/provider/gemini-llm-provider.ts`).

## Non-negotiable boundary

The external LLM controls the conversation. SymbolWright controls the coding-agent runtime.

Provider keys, GitHub writes, tool execution, audit trails, terminal output, session state, and PR readiness must stay inside SymbolWright policy gates.
