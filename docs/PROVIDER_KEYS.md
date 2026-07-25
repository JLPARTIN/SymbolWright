# Provider Key Boundary

SymbolWright uses two different key classes.

## 1. SymbolWright access key

`SYMBOLWRIGHT_API_KEY` controls access to SymbolWright itself, as the **local operator's** unrestricted credential — it is what the operator's own browser/dashboard/CLI use. It is not the credential to hand to an external LLM, coding agent, or automation: since Large PR Bundle #10 ("Delegated Agent Access"), external agents should instead be issued a scoped, expiring, revocable `sw_agent_...` credential (see [`docs/security/DELEGATED_AGENT_ACCESS.md`](security/DELEGATED_AGENT_ACCESS.md)) rather than the shared operator key. `SYMBOLWRIGHT_AGENT_TOKEN` is a related, agent-side-only environment variable — it holds one such scoped token and is read by `symbolwright mcp-server` to scope that MCP connection to the token's grant (see `docs/runtime/SYMBOLWRIGHT_MCP_SERVER.md`); it is never set on the server side and never controls what the server itself accepts.

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
