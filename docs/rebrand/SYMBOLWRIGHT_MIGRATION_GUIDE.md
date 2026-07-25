# SymbolWright Migration Guide

CodeMind has been renamed to **SymbolWright** — product identity,
documentation, UI, environment variables, persisted-state directory, the
published npm package, the CLI binary, and the MCP handshake identity are
all now SymbolWright. Every `codemind`-named equivalent (package name, CLI
binaries, `CODEMIND_*` environment variables, `.codemind` state directory,
browser-stored settings) keeps working unchanged as a compatibility layer
— existing installs and automation need zero immediate action.

## Why

The product is now branded SymbolWright. This guide covers what changed,
what still works unchanged, and how to move onto the new canonical names at
your own pace.

## What you need to do

**Nothing, immediately.** Every legacy name documented below keeps working.
When you're ready, switch to the canonical names — there's no forced
deadline for this phase of the rebrand.

## Environment variables

The canonical variable prefix is now `SYMBOLWRIGHT_*`. Every
`CODEMIND_*` variable you're already using keeps working as a fallback:

| Old (still works) | New (canonical) |
|---|---|
| `CODEMIND_API_KEY` | `SYMBOLWRIGHT_API_KEY` |
| `CODEMIND_CHAT_HOST` | `SYMBOLWRIGHT_CHAT_HOST` |
| `CODEMIND_CHAT_PORT` | `SYMBOLWRIGHT_CHAT_PORT` |
| `CODEMIND_CORS_ORIGIN` | `SYMBOLWRIGHT_CORS_ORIGIN` |
| `CODEMIND_TLS_CERT_FILE` / `CODEMIND_TLS_KEY_FILE` | `SYMBOLWRIGHT_TLS_CERT_FILE` / `SYMBOLWRIGHT_TLS_KEY_FILE` |
| `CODEMIND_PROVIDER` / `CODEMIND_MODEL` | `SYMBOLWRIGHT_PROVIDER` / `SYMBOLWRIGHT_MODEL` |
| `CODEMIND_MAX_TOKENS` / `CODEMIND_BASE_URL` | `SYMBOLWRIGHT_MAX_TOKENS` / `SYMBOLWRIGHT_BASE_URL` |
| `CODEMIND_EMBEDDING_PROVIDER` | `SYMBOLWRIGHT_EMBEDDING_PROVIDER` |
| `CODEMIND_RUNTIME_MODE` | `SYMBOLWRIGHT_RUNTIME_MODE` |
| `CODEMIND_WEB_MODE` | `SYMBOLWRIGHT_WEB_MODE` |
| `CODEMIND_OPENAI_COMPATIBLE_API_KEY` / `_BASE_URL` | `SYMBOLWRIGHT_OPENAI_COMPATIBLE_API_KEY` / `_BASE_URL` |
| `CODEMIND_PROVIDER_FALLBACKS` | `SYMBOLWRIGHT_PROVIDER_FALLBACKS` |
| `CODEMIND_PROVIDER_<ID>_DISABLED` | `SYMBOLWRIGHT_PROVIDER_<ID>_DISABLED` |
| `CODEMIND_DISABLE_SKILL_SHELL_EXECUTION` | `SYMBOLWRIGHT_DISABLE_SKILL_SHELL_EXECUTION` |
| `CODEMIND_SANDBOX_*` (docker binary, image, memory, cpus, user, network, timeout, max output bytes) | `SYMBOLWRIGHT_SANDBOX_*` |

**Precedence:** if you set the new `SYMBOLWRIGHT_*` variable, it always
wins. If you set only the old `CODEMIND_*` variable, it's used as before.
If you set **both to different values**, SymbolWright uses the new one and
prints a one-line warning to stderr (never including the actual secret
value for API keys) — set only the new variable to silence it.

**`.env.example`, setup scripts, and docs** now show the `SYMBOLWRIGHT_*`
form. Existing `.env` files with `CODEMIND_*` entries don't need to change.

## State directory (`.codemind` → `.symbolwright`)

SymbolWright now stores local state (missions, checkpoints, memory,
sandbox history, sessions) under `.symbolwright/` instead of `.codemind/`,
both in your home directory (`~/.symbolwright`) and per-workspace
(`<repo>/.symbolwright`).

**On first run after upgrading**, if you have an existing `.codemind/`
directory and no `.symbolwright/` directory yet, SymbolWright automatically
copies your state over and renames the original aside to
`.codemind.migrated` — **your data is never deleted**, only copied and the
original renamed. You'll see a one-line message like:

```
[symbolwright] Migrated state from "/home/you/.codemind" to "/home/you/.symbolwright".
```

If both `.codemind/` and `.symbolwright/` already exist with independent
data (for example, you ran a newer SymbolWright build once before this
migration existed), nothing is merged or overwritten automatically —
you'll see a warning telling you both directories have state, and
`.symbolwright/` is used as the active one. Inspect `.codemind/` manually
and copy over anything you still need.

If migration is interrupted (process killed mid-copy), simply re-run
SymbolWright — it detects the incomplete migration and resumes safely; no
duplicate or corrupted state results.

## CLI

The canonical command is now `symbolwright` (and `symbolwright-workspace`).
The old `codemind` and `codemind-workspace` commands **keep working
unchanged** — both names point at the exact same executable, so scripts
and muscle memory built around `codemind ...` don't need to change.

```
symbolwright agent --mode APPROVED_EXECUTION "fix the failing tests"
codemind agent --mode APPROVED_EXECUTION "fix the failing tests"   # identical, still works
```

## Package / import identity

The published npm package is now `symbolwright`
(`npm install symbolwright` / `npx symbolwright ...`). The old `codemind`
package name and its `codemind`/`codemind-workspace` binaries are kept as
permanent aliases in the same package — installing either name gets you
the same tool. There is currently no deprecation timeline for the
`codemind` aliases.

## MCP server / client identity

The MCP `initialize` handshake now reports `name: "symbolwright"` (both
when SymbolWright runs as an MCP **server** — `symbolwright mcp-server` /
`codemind mcp-server`, identical — and when it runs as an MCP **client**
calling other servers). If your MCP client config matches on this
identity string rather than just the process path, update it to
`symbolwright`; the invocation command itself (`codemind mcp-server`)
still works either way.

## Browser / dashboard settings

If you already had an API key saved in the SymbolWright/CodeMind dashboard
(`symbolwright serve`'s browser UI), it keeps working — on first load, the
browser automatically copies your key from the old `codemind_api_key`
localStorage entry into the new `symbolwright_api_key` entry. The Settings
page's "Clear key" button now clears both. Nothing is lost, and there's no
action required.

## GitHub repository

The repository now lives at `github.com/JLPARTIN/SymbolWright`. GitHub
automatically redirects the old `github.com/JLPARTIN/CodeMind` URL, so
existing clones, bookmarks, and CI configs referencing the old location
keep working — but update your `git remote` to the new URL when
convenient, since GitHub's redirect isn't guaranteed to be permanent.

## What hasn't changed (still deferred)

- **The `x-codemind-connector` HTTP header** used by the external AELIB
  integration — this needs coordination with that system before it can
  be renamed, and hasn't happened yet.
- **The `cm-` session-ID filename prefix** — cosmetic, not addressed.

## Troubleshooting

**"I see a warning about conflicting SYMBOLWRIGHT_API_KEY and
CODEMIND_API_KEY values."** You have both set to different values.
SymbolWright uses `SYMBOLWRIGHT_API_KEY`. Unset `CODEMIND_API_KEY` (or make
them match) to clear the warning.

**"I see a warning about both `.codemind` and `.symbolwright` having
state."** You ran a build that already used `.symbolwright/` before this
migration logic existed, and you also still have a `.codemind/` directory.
Nothing was merged automatically. Compare the two directories and manually
copy over anything from `.codemind/` you still need, then remove it
yourself once you've confirmed `.symbolwright/` has everything.

**"Migration says it failed."** The error message names the exact path
and reason (e.g. a permissions issue) without leaking any secret content.
Your original `.codemind/` directory is never modified or deleted when
migration fails — fix the underlying issue (for example, filesystem
permissions) and re-run.

## Rollback

If you need to roll back to a build that only understood `.codemind` and
`CODEMIND_*`:
1. Your renamed-aside legacy directory is at `<workspace>/.codemind.migrated`
   (or `~/.codemind.migrated`) — rename it back to `.codemind`.
2. Set `CODEMIND_API_KEY` (and any other `CODEMIND_*` variables you use) —
   they were never removed from your environment by this migration.
3. `npm install codemind` still installs the exact same package as
   `npm install symbolwright`, so no reinstall is strictly needed either
   way — just keep invoking it as `codemind ...` if you prefer.
