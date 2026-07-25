# SymbolWright Web Access Runtime (`web_fetch` / `web_search`)

Real web access for SymbolWright as a coding agent — reachable immediately after
install, no allowlist setup, no approval prompts. Governance here means
*controllable*, not *disabled by default*: normal public web access works out
of the box; the surfaces that are actually risky (private/internal network
targets, non-http(s) schemes) are blocked by default with an explicit switch
to override them.

## Product stance

```txt
Default: useful out of the box
Controls: available when needed
Strict mode: optional
Off switch: available
```

`web_fetch` and `web_search` are gated the same way as every other read-only
info tool in SymbolWright (see `docs/governance/SYMBOLWRIGHT_PERMISSION_MODEL.md`):
`RuntimePolicySnapshot.allowReadOnlyNetwork` is `true` in every runtime mode.
On top of that coarse gate, this bundle adds a **web-specific** control layer
(`web.mode`, domain lists, private-network blocking) — the finer knobs live
here, not in the runtime mode system.

## Config: `.symbolwright/config.json`

```json
{
  "web": {
    "enabled": true,
    "mode": "developer",
    "requireApproval": false,
    "fetch": {
      "enabled": true,
      "timeoutMs": 10000,
      "maxBytes": 2000000,
      "maxRedirects": 5,
      "allowPublicInternet": true,
      "allowPrivateNetwork": false,
      "allowedDomains": [],
      "deniedDomains": [],
      "allowedContentTypes": [
        "text/html",
        "text/plain",
        "text/markdown",
        "application/json",
        "application/xml"
      ]
    },
    "search": {
      "enabled": true,
      "provider": "duckduckgo",
      "maxResults": 8,
      "timeoutMs": 10000
    },
    "redaction": true
  }
}
```

Every field is optional and defaults to the values above — a repo with no
`.symbolwright/config.json` at all gets full `developer`-mode web access with
zero setup. Parser: `src/web/web-config.ts` (`loadWebConfig`, `mergeWebConfig`).

`SYMBOLWRIGHT_WEB_MODE` (`developer`/`ask`/`strict`/`off`) overrides `web.mode`
from the environment, taking precedence over the config file.

## Modes

```txt
developer   default; public web works immediately, no approval prompts
ask         public web allowed, but each call needs an approval ticket
            with the "web:access" scope
strict      allowlist-only — nothing is reachable until fetch.allowedDomains
            is set to a non-empty list
off         web_fetch and web_search are both disabled
```

`web.fetch.allowedDomains` / `deniedDomains` apply in every mode (not just
`strict`) — they're available as extra guardrails even in `developer` mode.

## Hard safety rails (not policy — always enforced)

These hold regardless of `web.mode`, `allowPrivateNetwork`, or any config:

```txt
Only http/https URLs are ever requested.
file://, ftp://, data:, javascript: are always rejected.
```

`src/web/web-safety.ts` (`isSafeUrlScheme`).

## Private/internal network blocking (policy — overridable)

Blocked by default, everywhere:

```txt
localhost, *.localhost
127.0.0.0/8, 0.0.0.0
::1, ::, fe80::/10, fc00::/7
169.254.0.0/16  (covers the 169.254.169.254 cloud metadata endpoint)
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
```

`src/web/web-safety.ts` (`isPrivateOrInternalHost`). This matters for local
dev: fetching `http://localhost:3000` or a Codespaces-forwarded port needs an
explicit override —

```sh
symbolwright web fetch http://localhost:3000 --allow-private
symbolwright web fetch http://localhost:3005 --allow-private
```

— or `"web": { "fetch": { "allowPrivateNetwork": true } }` in config.

## Policy evaluation

`src/web/web-policy.ts` (`evaluateWebFetchAccess`, `evaluateWebSearchAccess`),
applied in order:

```txt
1. hard scheme rail (http/https only)                — web_fetch only
2. runtime policy: allowReadOnlyNetwork must be true  — both tools
3. web.enabled / web.mode !== 'off'                   — both tools
4. web.mode === 'ask' requires a "web:access" approval ticket
5. private/internal host blocked unless allowPrivateNetwork  — web_fetch only
6. strict mode requires a non-empty allowedDomains list       — web_fetch only
7. allowedDomains / deniedDomains                              — web_fetch only
```

Every redirect hop web_fetch follows is re-validated against steps 1 and 5 —
a redirect can't smuggle a request into a blocked target.

## web_fetch

```sh
symbolwright web fetch <url> [--json] [--allow-private] [--mode <mode>] [--config <path>]
```

Execution: `src/web/web-fetch-client.ts` (raw HTTP: manual redirect loop
capped at `maxRedirects` with a hop re-validated each time, byte-capped body
read, content-type allowlist, one overall timeout) + `src/web/web-fetch.ts`
(policy gate → fetch → redact → audit trace → evidence).

Evidence shape:

```json
{
  "tool": "web_fetch",
  "url": "https://example.com",
  "finalUrl": "https://example.com",
  "status": "ok",
  "httpStatus": 200,
  "contentType": "text/html",
  "title": "Example Domain",
  "excerpt": "Example Domain This domain is for use in documentation examples...",
  "hash": "ff67a9d764d6a2367a187734e697f6a53217db9a21c101d410a113ca871a299d",
  "truncated": false,
  "fetchedAt": "2026-07-02T19:59:39.230Z",
  "durationMs": 580,
  "auditTrace": [ { "action": "web_fetch:https://example.com", "status": "allowed", "detail": "...", "timestamp": "..." } ]
}
```

`status` is one of `ok`, `blocked` (policy denial or invalid URL),
`http_error` (non-2xx response, or a redirect chain that ran out of hops),
or `transport_error` (timeout, DNS/connection failure).

## web_search

```sh
symbolwright web search "<query>" [--json] [--mode <mode>] [--config <path>]
```

Default provider: `src/web/web-search-provider.ts`'s `DuckDuckGoSearchProvider`
— DuckDuckGo's lightweight HTML endpoint (`html.duckduckgo.com/html/`), no
API key, real HTML parsing (no external HTML-parser dependency; a small
regex-based extractor, per the project's zero-dependency policy). DuckDuckGo
occasionally answers automated traffic with an anti-bot challenge page
instead of results — that's detected and reported as `transport_error`
rather than silently claimed as "0 results," since a block is not an answer.

`WebSearchProvider` is a small interface, so an alternate provider (Brave,
Bing, Tavily, a custom HTTP provider) can be swapped in without touching
`src/web/web-search.ts`'s policy/redaction/evidence pipeline — not shipped in
this bundle to avoid "fake providers behind a config flag nobody wired up";
only the one real, working default is included.

Evidence shape:

```json
{
  "tool": "web_search",
  "query": "typescript vitest coverage branch threshold",
  "provider": "duckduckgo",
  "status": "ok",
  "results": [
    { "title": "Coverage | Guide | Vitest", "url": "https://vitest.dev/guide/coverage.html", "snippet": "..." }
  ],
  "fetchedAt": "2026-07-02T20:01:29.000Z",
  "durationMs": 1365,
  "auditTrace": [ { "action": "web_search:duckduckgo:...", "status": "allowed", "detail": "...", "timestamp": "..." } ]
}
```

## Redaction

Before any fetched content, search snippet, or title reaches evidence
output, an audit event, or the CLI, it's run through the same secret/path
redactor used by MCP (`redactValidationOutput`, wrapped as `redactWebText` in
`src/web/web-redaction.ts`). Disable via `"web": { "redaction": false }` if
needed — on by default.

## Runtime tools

`web_fetch` and `web_search` are registered in
`src/runtime/tools/tool-assembly.ts` with capability `WEB_ACCESS`, and their
JSON schemas are registered in `src/agent/tool-schema-bridge.ts` so they're
callable by the agent loop, not just the CLI.

## Try it

```sh
npm run build
node dist/cli.js web fetch https://example.com
node dist/cli.js web search "typescript vitest coverage branch threshold"

# Blocked by default, explicit override required:
node dist/cli.js web fetch http://localhost:3000              # blocked
node dist/cli.js web fetch http://localhost:3000 --allow-private  # allowed
node dist/cli.js web fetch http://169.254.169.254/latest/meta-data/  # blocked, no override for this one matters — see below
node dist/cli.js web fetch file:///etc/passwd                 # blocked, always
node dist/cli.js web fetch https://example.com --mode off     # blocked
```

(The cloud metadata endpoint is still just a private/internal address under
the hood — `--allow-private` would technically unblock it too, the same way
it would for `localhost`. There's no separate carve-out for it; treat
`allowPrivateNetwork` as "I trust this network," not "except metadata.")

## Tests

Deterministic, no live internet required in CI:

- `src/web/web-config.spec.ts` — config merge/defaults/env override.
- `src/web/web-safety.spec.ts` — scheme + private-network detection.
- `src/web/web-policy.spec.ts` — every mode/gate combination.
- `src/web/web-fetch-client.spec.ts` — real HTTP mechanics (redirects,
  byte cap, content-type allowlist, timeout) against a real local
  `node:http` server, not mocks.
- `src/web/web-fetch.spec.ts` — the full orchestration pipeline, same local
  server.
- `src/web/web-search-provider.spec.ts` — DuckDuckGo HTML parsing against a
  static fixture (`fixtures/web/duckduckgo-sample.html`), plus the
  anti-bot-challenge detection path, with an injected fetch — no live DDG
  call.
- `src/web/web-search.spec.ts` — orchestration tested with a fake provider.
- `src/runtime/tools/web-fetch-tool.spec.ts`,
  `src/runtime/tools/web-search-tool.spec.ts`, `src/cli-web.spec.ts` —
  runtime tool and CLI end-to-end.

This doc's own examples above were run for real against the live internet
(through this repo's actual `dist/cli.js`) as part of building this bundle —
not simulated.

## Hard boundaries (by design, this bundle)

```txt
no browser automation
no recursive crawler
no hidden scraping loop
no login/session scraping
no credential exfiltration
no unbounded downloads (maxBytes enforced)
no fake search results (anti-bot challenges are reported, not hidden)
no fake provider (only the one real, working DuckDuckGo adapter ships)
no disabled-by-default web feature
```
