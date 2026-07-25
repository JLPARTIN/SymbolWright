# Provider Key Boundary

SymbolWright uses two different key classes.

## 1. SymbolWright access key

`SYMBOLWRIGHT_API_KEY` controls access to SymbolWright itself. Browsers, external LLMs, coding agents, and API clients may send this key to the SymbolWright API.

## 2. Provider credentials

Provider credentials are keys for OpenAI, Anthropic, Gemini, Groq, OpenRouter, GitHub Models, Ollama, DeepSeek (`DEEPSEEK_API_KEY`), or custom providers.

These keys must not live in the browser. They must be handled in one of these server-side modes:

| Mode | Meaning |
| --- | --- |
| `server_vault` | SymbolWright stores the provider key server-side and routes requests through the provider adapter. |
| `request_scoped` | SymbolWright receives a short-lived provider credential on the server side and does not persist it. |
| `local_runtime` | SymbolWright reaches a local provider such as Ollama from the server runtime. |

## Hard rule

Do not implement this pattern:

```txt
Browser → Provider API
```

Use this pattern instead:

```txt
Browser → SymbolWright API → Provider Adapter → Provider API
```

That keeps provider switching, audit logs, redaction, mission state, tool policy, and PR governance under SymbolWright control.

## Registering a provider at runtime

`symbolwright serve` (see
[`runtime/SYMBOLWRIGHT_CHAT_SERVER.md`](runtime/SYMBOLWRIGHT_CHAT_SERVER.md)) accepts
`POST /api/providers/register` to set or override a provider's `baseUrl`,
`apiKey`, and `model` while the server is running — this is how you "put an
API from wherever you want" without redeploying. Registered keys are held in
memory on the server only, never echoed back, and lost on restart.

## Current provider contract

The canonical provider registry is `src/providers/provider-adapter-contract.ts`.

Every provider must declare:

- provider id;
- display name;
- credential mode;
- server endpoint ownership;
- browser credential safety;
- capabilities;
- operator notes.

Release-readiness must block if provider keys are allowed to leave the server boundary.
