# Provider Key Boundary

CodeMind uses two different key classes.

## 1. CodeMind access key

`CODEMIND_API_KEY` controls access to CodeMind itself. Browsers, external LLMs, coding agents, and API clients may send this key to the CodeMind API.

## 2. Provider credentials

Provider credentials are keys for OpenAI, Anthropic, Gemini, Groq, OpenRouter, GitHub Models, Ollama, or custom providers.

These keys must not live in the browser. They must be handled in one of these server-side modes:

| Mode | Meaning |
| --- | --- |
| `server_vault` | CodeMind stores the provider key server-side and routes requests through the provider adapter. |
| `request_scoped` | CodeMind receives a short-lived provider credential on the server side and does not persist it. |
| `local_runtime` | CodeMind reaches a local provider such as Ollama from the server runtime. |

## Hard rule

Do not implement this pattern:

```txt
Browser → Provider API
```

Use this pattern instead:

```txt
Browser → CodeMind API → Provider Adapter → Provider API
```

That keeps provider switching, audit logs, redaction, mission state, tool policy, and PR governance under CodeMind control.

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
