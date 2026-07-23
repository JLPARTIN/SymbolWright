# Codetelligence Rebrand Foundation

## Purpose

This bundle begins the compatibility-safe migration from **CodeMind** to **Codetelligence**. It deliberately does not rename the GitHub repository, npm package, persistent mission schemas, or every source filename in one destructive change.

Codetelligence is now the canonical runtime and application identity. Existing CodeMind integrations remain accepted while later bundles migrate durable storage, package distribution, filenames, documentation, and repository coordinates.

## Canonical identity

| Surface | Canonical value |
| --- | --- |
| Product | `Codetelligence` |
| Environment prefix | `CODETELLIGENCE_` |
| Config directory | `.codetelligence` |
| MCP server name | `codetelligence` |
| Browser storage prefix | `codetelligence_` |
| AELIB connector header | `x-codetelligence-connector` |

The complete canonical and legacy contract is stored in `rebrand-manifest.json`.

## Compatibility rules

1. A `CODETELLIGENCE_*` environment variable wins when both brand namespaces are configured.
2. The corresponding `CODEMIND_*` variable remains a fallback.
3. `.codetelligence/config.json` is read before `.codemind/config.json`.
4. Existing browser values are copied from `codemind_*` keys into `codetelligence_*` keys on first load.
5. The old browser state property remains synchronized while active views are migrated.
6. The MCP server reports `codetelligence`, while `runCodemindMcpServer` remains a deprecated source alias.
7. AELIB requests send the new connector header and the old header during transition.
8. Both access-key variable names are secret-redacted.
9. Legacy persistent data is never deleted automatically.

## New environment variables

```text
CODETELLIGENCE_API_KEY
CODETELLIGENCE_PROVIDER
CODETELLIGENCE_MODEL
CODETELLIGENCE_MAX_TOKENS
CODETELLIGENCE_BASE_URL
CODETELLIGENCE_EMBEDDING_PROVIDER
CODETELLIGENCE_RUNTIME_MODE
CODETELLIGENCE_CHAT_HOST
CODETELLIGENCE_CHAT_PORT
CODETELLIGENCE_CORS_ORIGIN
CODETELLIGENCE_TLS_CERT_FILE
CODETELLIGENCE_TLS_KEY_FILE
CODETELLIGENCE_AELIB_ENDPOINT
CODETELLIGENCE_AELIB_HEALTH_PATH
CODETELLIGENCE_AELIB_TOKEN
```

Provider-owned variables such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, and `VOYAGE_API_KEY` are not renamed.

## Browser migration

The application now reads and writes:

```text
codetelligence_api_key
codetelligence_mode
codetelligence_active_mission_id
```

When a canonical value is absent, the corresponding CodeMind value is copied forward. Clearing the access key removes both the new and old key to avoid leaving credentials behind.

## Deferred work

Later Large PR Bundles must implement:

- atomic `.codemind` to `.codetelligence` durable-data migration;
- dual mission-bundle schema reading;
- canonical npm package and CLI binaries;
- public TypeScript symbol and source-filename migration;
- complete UI, CLI, documentation, fixture, and report census;
- GitHub repository rename;
- GHCR package migration;
- downstream PromptOps-Sentinel and AELIB integration cutover;
- final removal of deprecated CodeMind compatibility in a breaking release.

## Validation requirements

This foundation is complete only when:

- canonical environment values override legacy values;
- legacy values remain functional;
- both access-key names are redacted;
- existing browser sessions retain their key and active mission;
- the application title, version output, server banner, and MCP identity use Codetelligence;
- AELIB receives the new header without losing the old one;
- the full repository validation workflow passes.
