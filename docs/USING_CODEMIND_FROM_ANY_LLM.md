# Using CodeMind From Any LLM

CodeMind should be callable from any LLM or coding environment that can make an HTTP request or follow an API contract.

## What's live today

`codemind serve` (see [`runtime/CODEMIND_CHAT_SERVER.md`](runtime/CODEMIND_CHAT_SERVER.md)) runs a real `/api/chat` endpoint with bearer-token auth, provider registration, and SSE streaming — any HTTP-capable client (browser, script, GPT action, agent framework) can drive it today. A native MCP *server* wrapper, so MCP-compatible clients like Claude Desktop can add CodeMind as a one-click connector, is not built yet — the client pattern below describes the target shape once that lands.

## Client pattern

Give the external LLM this contract:

```txt
Base URL: https://codemind.example.com/api
Authorization: Bearer <CODEMIND_API_KEY>
Mission route: POST /api/missions
Events route: GET /api/missions/:id/events
```

The LLM should send CodeMind a mission and let CodeMind handle provider selection, repo evidence, tools, memory, validation, PR preparation, and audit trails.

## Example mission

```json
{
  "client": "chatgpt",
  "provider": "anthropic",
  "repo": "JLPARTIN/CodeMind",
  "mission": "Inspect the current repository state, generate large PR bundles, and produce a release-readiness report.",
  "stream": true
}
```

## Recommended LLM instruction

```txt
Use CodeMind as the coding-agent runtime. Do not directly mutate the repository. Submit the mission to CodeMind, read the streamed events, and summarize CodeMind's findings, validation proof, and PR readiness state.
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

CodeMind can route through:

- OpenAI
- Anthropic
- Google Gemini
- Groq
- OpenRouter
- GitHub Models
- Ollama
- custom providers

## Non-negotiable boundary

The external LLM controls the conversation. CodeMind controls the coding-agent runtime.

Provider keys, GitHub writes, tool execution, audit trails, terminal output, session state, and PR readiness must stay inside CodeMind policy gates.
