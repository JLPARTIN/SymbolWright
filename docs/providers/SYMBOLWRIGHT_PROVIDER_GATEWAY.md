# CodeMind Provider Gateway

**Status:** Provider Gateway Foundation  
**Scope:** Multi-provider AI request configuration, routing, request mapping, response normalization, and secret-safe reporting

---

## What exists now

CodeMind now has a real provider gateway foundation under `src/providers/`.

It supports these provider IDs through one internal gateway interface:

```txt
openai
anthropic
google-gemini
groq
openrouter
github-models
ollama
custom
```

This foundation is not a fake UI or prompt-only integration. It provides callable TypeScript modules for:

```txt
provider config loading
provider secret redaction
provider status reporting
provider request routing
provider fallback selection
OpenAI-compatible request mapping
Anthropic request mapping
Google Gemini request mapping
HTTP transport injection
provider response normalization
provider error normalization
```

---

## Provider environment variables

```bash
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
GITHUB_TOKEN=
CODEMIND_PROVIDER=
CODEMIND_MODEL=
CODEMIND_PROVIDER_FALLBACKS=
CODEMIND_OPENAI_COMPATIBLE_BASE_URL=
CODEMIND_OPENAI_COMPATIBLE_API_KEY=
```

Secrets must stay server-side. Redacted config output may report whether a key is configured or missing, but it must not print key material.

---

## Provider selection

The gateway resolves providers in this order:

```txt
request.providerId
CODEMIND_PROVIDER
CODEMIND_PROVIDER_FALLBACKS
built-in safe fallback order
```

Fallback only handles unavailable configuration states such as missing credentials or disabled provider configuration. Provider HTTP failures are returned as real failures instead of silently hiding provider outages.

---

## OpenAI-compatible providers

The following providers use the OpenAI-compatible chat completions request shape:

```txt
openai
groq
openrouter
github-models
ollama
custom
```

They map internal CodeMind messages to:

```txt
POST /chat/completions
```

The custom provider uses:

```bash
CODEMIND_OPENAI_COMPATIBLE_BASE_URL=
CODEMIND_OPENAI_COMPATIBLE_API_KEY=
```

This makes future providers easy to add when they expose an OpenAI-compatible API.

---

## Anthropic provider

The Anthropic adapter maps CodeMind messages to:

```txt
POST /v1/messages
```

System messages are folded into Anthropic's `system` field. User and assistant messages remain in the `messages` array.

---

## Google Gemini provider

The Google Gemini adapter maps CodeMind messages to:

```txt
POST /v1beta/models/{model}:generateContent
```

System prompt content is mapped into `systemInstruction`. Assistant messages are mapped to Gemini's `model` role.

---

## Test strategy

Tests use injected HTTP transport. They do not require live API keys and do not call external provider APIs.

This keeps CI deterministic while still proving that request mapping, fallback routing, redaction, and response parsing are real.

---

## Not included in this bundle

This bundle intentionally does not add the provider CLI or browser UI.

Those belong in later bundles:

```txt
Bundle #2 Provider CLI and agent runtime wiring
Bundle #3 Standalone app/browser provider surface
Bundle #4 AELIB-X1YA0I connector contract
```

No fake connected state is introduced here.
