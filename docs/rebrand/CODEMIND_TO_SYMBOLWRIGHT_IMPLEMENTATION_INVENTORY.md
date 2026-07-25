# CodeMind → SymbolWright Implementation Inventory

**Status:** Implementation complete for Phases 1–6 (of the 8-phase plan in
`docs/rebrand/CODEMIND_TO_SYMBOLWRIGHT_FORENSIC_AUDIT.md`). Phase 7
(external AELIB header coordination) remains deferred — see §12.
**Baseline branch:** `chore/symbolwright-rebrand-phase1-5`, continued on
`chore/symbolwright-rebrand-phase6-npm-cli`
**Baseline commit (pre-rebrand):** `767a5b0` (`main`, PR #283 merged)
**This document reflects the actual implementation, updated after the work
was done** — it is a record of what happened, not a pre-implementation plan.

**Update (Phase 6):** the operator directed continuing into Phase 6 in a
follow-up session. Sections 1–11 below describe the original Phase 1–5
work exactly as implemented at the time (npm/CLI/MCP identity still
`codemind`-only). §12 documents what changed in Phase 6: the npm package,
CLI binaries, and MCP handshake identity are now canonically
`symbolwright`, with `codemind` kept as a permanent working alias (not a
deprecated shim on a removal timeline).

---

## 1. Repository Baseline

| Property | Value |
|---|---|
| Repository | `JLPARTIN/CodeMind` |
| Branch | `chore/symbolwright-rebrand-phase1-5` (from `main`) |
| Package identity | `codemind` (npm), unchanged — see §9 |
| Files changed | ~670 |
| Working tree at start | Clean |

## 2. Naming Map (as applied)

| Context | Old | New | Applied? |
|---|---|---|---|
| Product name (prose) | `CodeMind` | `SymbolWright` | Yes |
| Lowercase compact (internal) | `codemind` | `symbolwright` | Yes, except CLI-invocation tokens and external contracts (§9) |
| Uppercase compact | `CODEMIND` | `SYMBOLWRIGHT` | Yes |
| PascalCase identifiers | `CodeMind`/`Codemind` | `SymbolWright` | Yes (both casing variants merged to the correct spelling) |
| State directory | `.codemind` | `.symbolwright` | Yes, with migration (§5) |
| Primary API key | `CODEMIND_API_KEY` | `SYMBOLWRIGHT_API_KEY` | Yes, with legacy fallback (§4) |
| npm package / CLI binary | `codemind` | *(unchanged)* | **Deferred** — see §9 |
| MCP server/client handshake name | `codemind` | *(unchanged)* | **Deferred** — see §9 |

## 3. Scope Decision (operator-directed)

Per explicit operator instruction during this session, the mission's
"one Large PR Bundle including npm package/CLI rename" instruction was
**not** followed literally. Instead:

- Followed the already-merged forensic audit's phased plan (Phases 1–5).
- Included the full `.codemind` → `.symbolwright` persisted-state migration
  (with tests), per operator confirmation.
- Kept the published npm package name (`codemind`), CLI binary names
  (`codemind`, `codemind-workspace`), and the MCP server/client handshake
  identity (`name: 'codemind'`) unchanged, because these are external
  contracts real users/automation may already depend on and renaming them
  is a breaking change with no deprecation window — out of scope for this
  pass (Phase 6+ in the original audit).

## 4. Environment Variable Compatibility

New central helper: `src/config/env-compat.ts` —
`readEnvWithLegacyFallback(canonicalName, legacyName, { env, sensitive })`.
Canonical `SYMBOLWRIGHT_*` wins; falls back to legacy `CODEMIND_*` when
canonical is unset; on conflict (both set, different values) emits a
`console.error` warning and uses canonical — `sensitive: true` suppresses
the raw values in that warning (used for API keys).

Wired into every production `CODEMIND_*` read site:

| Canonical | Legacy | Read site |
|---|---|---|
| `SYMBOLWRIGHT_API_KEY` | `CODEMIND_API_KEY` | `src/cli-serve.ts` |
| `SYMBOLWRIGHT_CHAT_HOST` | `CODEMIND_CHAT_HOST` | `src/cli-serve.ts` |
| `SYMBOLWRIGHT_CHAT_PORT` | `CODEMIND_CHAT_PORT` | `src/cli-serve.ts` |
| `SYMBOLWRIGHT_CORS_ORIGIN` | `CODEMIND_CORS_ORIGIN` | `src/cli-serve.ts` |
| `SYMBOLWRIGHT_TLS_CERT_FILE` | `CODEMIND_TLS_CERT_FILE` | `src/cli-serve.ts` |
| `SYMBOLWRIGHT_TLS_KEY_FILE` | `CODEMIND_TLS_KEY_FILE` | `src/cli-serve.ts` |
| `SYMBOLWRIGHT_PROVIDER` | `CODEMIND_PROVIDER` | `src/config/symbolwright-config.ts`, `src/providers/provider-config.ts` |
| `SYMBOLWRIGHT_MODEL` | `CODEMIND_MODEL` | same |
| `SYMBOLWRIGHT_MAX_TOKENS` | `CODEMIND_MAX_TOKENS` | `src/config/symbolwright-config.ts` |
| `SYMBOLWRIGHT_BASE_URL` | `CODEMIND_BASE_URL` | same |
| `SYMBOLWRIGHT_EMBEDDING_PROVIDER` | `CODEMIND_EMBEDDING_PROVIDER` | same |
| `SYMBOLWRIGHT_RUNTIME_MODE` | `CODEMIND_RUNTIME_MODE` | same |
| `SYMBOLWRIGHT_WEB_MODE` | `CODEMIND_WEB_MODE` | `src/web/web-config.ts` |
| `SYMBOLWRIGHT_OPENAI_COMPATIBLE_API_KEY` | `CODEMIND_OPENAI_COMPATIBLE_API_KEY` | `src/providers/provider-config.ts` |
| `SYMBOLWRIGHT_OPENAI_COMPATIBLE_BASE_URL` | `CODEMIND_OPENAI_COMPATIBLE_BASE_URL` | same |
| `SYMBOLWRIGHT_PROVIDER_FALLBACKS` | `CODEMIND_PROVIDER_FALLBACKS` | same |
| `SYMBOLWRIGHT_PROVIDER_<ID>_DISABLED` | `CODEMIND_PROVIDER_<ID>_DISABLED` | same (dynamic per-provider) |
| `SYMBOLWRIGHT_DISABLE_SKILL_SHELL_EXECUTION` | `CODEMIND_DISABLE_SKILL_SHELL_EXECUTION` | `src/skills/skill-runtime.ts` |
| `SYMBOLWRIGHT_SANDBOX_DOCKER_BINARY` | `CODEMIND_SANDBOX_DOCKER_BINARY` | `src/runtime/sandbox/sandbox-runner.ts`, `src/portability/portable-validation-runner.ts` |
| `SYMBOLWRIGHT_SANDBOX_IMAGE` | `CODEMIND_SANDBOX_IMAGE` | `src/runtime/sandbox/sandbox-runner.ts` |
| `SYMBOLWRIGHT_SANDBOX_MEMORY` | `CODEMIND_SANDBOX_MEMORY` | same, and `portable-validation-runner.ts` |
| `SYMBOLWRIGHT_SANDBOX_CPUS` | `CODEMIND_SANDBOX_CPUS` | same |
| `SYMBOLWRIGHT_SANDBOX_USER` | `CODEMIND_SANDBOX_USER` | `sandbox-runner.ts` |
| `SYMBOLWRIGHT_SANDBOX_NETWORK` | `CODEMIND_SANDBOX_NETWORK` | same |
| `SYMBOLWRIGHT_SANDBOX_TIMEOUT_MS` | `CODEMIND_SANDBOX_TIMEOUT_MS` | same |
| `SYMBOLWRIGHT_SANDBOX_MAX_OUTPUT_BYTES` | `CODEMIND_SANDBOX_MAX_OUTPUT_BYTES` | same |

`CODEMIND_SECRET_TOKEN` (test-only fixture var, not a real product config
key) was left unchanged in the two spec files that use it — renaming it
carries no product value since any name works equally there.

The redaction pattern (`src/mission/mission-redaction.ts`) already matches
both names generically via `api[_-]?key`; `src/providers/provider-redaction.ts`'s
explicit secret-key allowlist was updated to include both
`SYMBOLWRIGHT_OPENAI_COMPATIBLE_API_KEY` and the legacy name.

## 5. Persistence Migration

New module: `src/storage/state-dir-migration.ts` + `state-dir-migration.spec.ts`
(10 tests, all scenarios in §12 of the original audit). Canonical directory
name is `.symbolwright` (`STATE_DIR_NAME`), legacy is `.codemind`
(`LEGACY_STATE_DIR_NAME`), both exported from `src/storage/storage-paths.ts`.

Migration behavior (`migrateLegacyStateDir(root)`):
- **Fresh** (neither dir exists): no-op.
- **Legacy only**: copies `.codemind` → `.symbolwright`, then renames the
  original aside to `.codemind.migrated` (never deleted).
- **Interrupted** (canonical dir exists with an in-progress marker but no
  completed marker): resumes and finishes the copy.
- **Already migrated** (completed marker present): no-op.
- **Conflict** (both dirs have independent data, no marker): does not
  merge or overwrite; reports the conflict; canonical dir is used as active
  state, legacy dir is left untouched for manual reconciliation.
- **Malformed legacy state** (not a directory) or **symlink escaping the
  workspace root**: fails safely, no partial canonical state written,
  original untouched.

Wired in at `src/cli.ts`'s `main()` — runs once per CLI invocation (except
pure `help`/`--version`) against both `homedir()` and `process.cwd()`,
logging `[symbolwright] ...` to stderr on migration or conflict.

33 call sites that hardcoded the `.codemind` directory-name literal were
updated to `.symbolwright`. 6 "ignore-list" style call sites (repo
scanners, protected-path lists, git-add exclusions) were updated to
recognize **both** `.symbolwright` and `.codemind` so legacy state
directories are never accidentally swept into a commit or repo scan even
before migration runs:

- `src/runtime/policy/runtime-policy.ts` (`DEFAULT_RUNTIME_PROTECTED_PATHS`, `DEFAULT_RUNTIME_NOISY_DIRS`)
- `src/portability/repository-portability.ts`, `src/portability/universal-repository-portability.ts` (`IGNORED_DIRECTORIES`)
- `src/memory/project-memory.ts` (indexer exclude list)
- `src/autonomy/repository-semantic-index-bootstrap.ts` (`IGNORED_DIRECTORIES`)
- `src/app/api/repository-routes.ts`, `src/app/api/github-intake-routes.ts`, `src/mission/mission-service.ts`, `src/autonomy/transactional-edit-session.ts` (path-prefix comparisons)

The memory database filename (`src/memory/storage/database.ts`) is now
`symbolwright.db` under `.symbolwright/memory/`, with a one-time adoption
step: if the canonical file doesn't exist but a legacy `codemind.db` does
in the same directory (i.e. copied over verbatim by the directory-level
migration, which doesn't rename file contents), it's renamed in place so
existing episodic/procedural memory isn't orphaned.

The pre-existing, already-committed `.codemind/` runtime-state anomaly
(`.codemind/memory/codemind.db`, `.codemind/sessions/cm-*.jsonl`,
`.codemind/memory/procedures.yaml` — a repo-hygiene defect unrelated to
this rebrand, documented in the original audit's §15) was left untouched.

## 6. Browser Storage Migration

`src/app/state/client-state.ts` (`buildClientStateScript`) and
`src/server/chat-transcript-client-script.ts` (the separate `codemind serve`
chat UI) both now read `symbolwright_api_key` / `symbolwright_mode` /
`symbolwright_active_mission_id`, falling back to the legacy
`codemind_api_key` / `codemind_mode` / `codemind_active_mission_id`
localStorage keys and forward-migrating the value (write canonical, never
delete legacy) via a shared `appReadMigratedStorageItem` /
`readMigratedStorageItem` helper embedded in each client script.

`appState.codemindKey` was renamed to `appState.symbolWrightKey`
throughout the view layer (`checkpoints-view.ts`, `dashboard-view.ts`,
`tools-view.ts`, `autonomy-view.ts`, `memory-view.ts`, `repository-view.ts`,
`missions-view.ts`, `settings-view.ts`). The Settings view's "Clear key"
action now removes both the canonical and legacy localStorage entries. The
DOM id `settings-codemind-key` / `codemind-key` (and the matching `<label>`
text "CodeMind access key (CODEMIND_API_KEY)") was renamed to
`settings-symbolwright-key` / `symbolwright-key` and "SymbolWright access
key (SYMBOLWRIGHT_API_KEY)".

The `window.codemindApplyMissionToAgent`/`ApplyMissionToRepository`/
`GetScratchMissionState`/`HandleWorkspaceDraft`/`OnConnected`/
`RecordMissionEvent`/`ReloadActiveMission` cross-module bridge functions
were all renamed to `window.symbolWright*` consistently at both their
definition and call sites (internal-only, no persistence implication).

## 7. Internal Code Identifiers and Files

~45 `src/**/codemind-*.ts` files (plus their `.spec.ts` counterparts) were
renamed to `symbolwright-*.ts` via `git mv`, including the two that didn't
match a simple glob (`codemind-runtime.types.ts`,
`codemind-permission.types.ts`). ~208 internal `class`/`interface`/`type`/
`const`/`enum` declarations were renamed (`CodemindConfig` →
`SymbolWrightConfig`, `CodeMindMission` → `SymbolWrightMission`,
`CodemindProviderId` → `SymbolWrightProviderId`, the `CODEMIND_*_BLOCK_ID`
traceability-constant family, etc.) via a case-preserving bulk substitution
followed by full `typecheck`/`build`/`test` verification and manual repair
of every regression it introduced (§8).

`src/permissions/codemind-permission.types.ts` (now
`symbolwright-permission.types.ts`) needed manual handling: its
`CODEMIND_TRUST_ZONES` enum's `CODEMIND_MD` member classifies files found
in *other* repositories being analyzed (their own `CODEMIND.md`
instruction-file convention), not this repo's identity — so it's kept
permanently alongside a new `SYMBOLWRIGHT_MD` member.
`src/context/project-instructions.ts`'s `PROJECT_INSTRUCTION_FILES` list
now recognizes `SYMBOLWRIGHT.md` and keeps recognizing `CODEMIND.md`
permanently, for the same reason.

## 8. Bulk-Rename Regressions Found and Fixed

The mechanical case-preserving substitution pass (applied to ~670 tracked
files) had two systematic blind spots, both fully repaired and covered by
the existing test suite (484 files, 3545 passing tests):

1. **Legacy-compatibility literals it shouldn't have touched.** Any
   `'CODEMIND_X'` string I had *just* written as the legacy half of a
   dual-read pair (env var names, the `.codemind` directory constant, the
   `codemind.db` legacy filename, browser-storage legacy keys, the
   "CODEMIND_API_KEY still works" error-message clause) got renamed to
   `SYMBOLWRIGHT_X` too, silently deleting the fallback. Found via
   `grep -rE "'SYMBOLWRIGHT_[A-Z_]+', ?'SYMBOLWRIGHT_[A-Z_]+'"` and a
   scripted pass restoring the second occurrence of each pair, then a
   manual pass for the handful that didn't fit that exact shape (map
   literals in `provider-config.ts`, template-literal env-var names,
   `database.ts`'s `LEGACY_DB_FILENAME`).
2. **Literal `codemind <subcommand>` CLI-invocation examples**, which
   must stay `codemind` since the binary name is deliberately unchanged
   (§9). A second regex pass (`\bsymbolwright\b(?=\s+(?:agent|serve|...))`
   over every real CLI subcommand name) reverted 488 occurrences across
   103 files back to `codemind`. A small number of MCP-config `"command"`
   fields and doctor/release-readiness identity checks
   (`pkg.name === 'codemind'`, `pkg.bin['codemind']`) needed the same
   manual fix since they compare against the real, unchanged
   `package.json`.

Both regressions were caught by re-running `npm run typecheck` /
`npm run lint` / `npx vitest run` / `npm run build` after the bulk pass —
listed as a concrete lesson in the Final Forensic Audit's Risks section.

## 9. Do-Not-Change Ledger (this pass)

| Item | Value kept | Reason |
|---|---|---|
| npm package name | `codemind` | Published package; rename breaks `npm install -g codemind` with no deprecation window. Deferred to a future Phase 6. |
| CLI bin entries | `codemind`, `codemind-workspace` | Same as above. |
| MCP server handshake (`src/mcp/mcp-server.ts`) | `name: 'codemind'` | External protocol identity; unknown downstream MCP clients may match on it. |
| MCP client identity (`src/mcp/mcp-client.ts`) | `name: 'codemind'` | Same class of risk as the server handshake. |
| `x-codemind-connector` header (`src/aelib/aelib-connector.ts`) | unchanged | Consumed by an external AELIB system; needs coordination before renaming (per original audit). |
| `src/package-contract.spec.ts`, `src/mcp/mcp-server-protocol.spec.ts` | assert `'codemind'` | Regression guards for the two contracts above — must track them, not the aspirational rename. |
| `docs/build-state/*` (5 files), `docs/autonomy/{BUNDLE6,BUNDLE7,POST_BUNDLE6,POST_BUNDLE7}*.md`, `docs/build-plans/LPRB-CM-SAVANT-PR-FORENSICS-01.md` | unchanged | Historical, dated, PR/commit-referenced records of closed work; rewriting would falsify history. |
| `docs/migration/AELIB_CODEMIND_EXTRACTION_NOTES.md` | unchanged | Historical record of a completed one-time extraction. |
| `docs/rebrand/CODEMIND_TO_SYMBOLWRIGHT_FORENSIC_AUDIT.md` | unchanged | The planning document this implementation follows; rewriting it after the fact would erase the plan/actual distinction. |
| `CHANGELOG.md` | unchanged | Dated historical entries describing what shipped, under names that were accurate at the time (including now-moved doc paths like `docs/runtime/CODEMIND_CHAT_SERVER.md`). |
| `fixtures/github-write-executor-fixture.json`, `fixtures/github-live-read-fixture.json`, `examples/ajna/*.json` | still say `JLPARTIN/CodeMind` / `"Validate CodeMind"` | These represent the *real*, still-unrenamed GitHub repository and CI job names; changing them now would make the fixtures factually wrong. Revisit only if/when Phase 6 (repo rename) happens. |
| `.codemind/memory/codemind.db`, `.codemind/sessions/cm-*.jsonl`, `.codemind/memory/procedures.yaml` (committed) | unchanged | Pre-existing repo-hygiene defect (accidentally committed runtime state), documented as out-of-scope by the original audit; not touched here either. |
| `src/workspace/language-registry.ts` TOML/XML example snippets (`[codemind]`, `<codemind>`) | unchanged | Describes a config-file convention recognized in *other* repositories being scanned by this tool, not this repo's own identity. |
| `cm-` session-ID filename prefix (`.codemind/sessions/cm-*.jsonl`) | unchanged | Deferred — not addressed in this pass; low risk, but changing the generator format has broader compatibility implications for already-stored session files that weren't validated here. |
| `CODEMIND_SECRET_TOKEN` (2 test-only spec fixtures) | unchanged | Arbitrary test env-var name with no product meaning. |

## 10. Validation Evidence

All run against the final state of this branch:

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run format:check` — clean
- `npx vitest run` — 484 files, 3545 passed, 1 pre-existing skip
- `npm run build` — clean
- `node dist/cli.js release-readiness` — `RELEASE_READY`, 16/16 gates pass, including a live demonstration of the persistence-migration conflict path against this repo's own real `.codemind/` (committed anomaly) vs. a locally-generated `.symbolwright/`

## 11. Known Gaps / Not Done in This Pass (Phase 1–5, as originally written)

- Phase 6 (GitHub repository rename, npm package/CLI binary rename, GHCR
  image path follow-through) — explicitly deferred, see §9.
- `x-codemind-connector` header rename — needs external AELIB coordination
  first, per the original audit.
- `cm-` session-ID prefix — not renamed (see §9).
- `docs/PROVIDER_KEYS.md`'s pre-existing gap (doesn't document several real
  `SYMBOLWRIGHT_SANDBOX_*`/`SYMBOLWRIGHT_TLS_*`/`SYMBOLWRIGHT_OPENAI_COMPATIBLE_*`
  vars) — pre-existing, not caused by this rebrand, not fixed here.

## 12. Phase 6: npm Package, CLI Binary, and MCP Identity Rename

Implemented in a follow-up session, per operator instruction to "proceed
with the next phases." Mid-session, `git push` revealed the GitHub
repository had *already* been renamed to `JLPARTIN/SymbolWright`
externally (not by any session) — that made the repo-rename part of this
phase already-done in practice; the remaining npm/CLI/MCP work below
reconciles the rest of the identity with that reality.

**npm package (`package.json`):**
- `name`: `codemind` → `symbolwright`. Verified available on the npm
  registry before renaming (`registry.npmjs.org/symbolwright` → 404).
- `version`: `0.1.0` → `0.2.0` (a new CHANGELOG entry documents the
  rename; see `CHANGELOG.md`'s `[0.2.0]` section).
- `bin`: now has **four** entries — `symbolwright`/`symbolwright-workspace`
  (canonical) and `codemind`/`codemind-workspace` (compatibility aliases),
  all four pointing at the identical `dist/cli.js` / `dist/cli-workspace-bin.js`
  build outputs. This is a permanent alias, not a deprecation-window shim
  with a removal date — no differentiated "you used the old name" notice
  is printed, since npm doesn't reliably tell an invoked script which bin
  alias name was used to launch it (`process.argv[1]` reflects the
  resolved script path, not the invocation alias), and a fragile detection
  hack wasn't worth it for a permanent alias.
- `repository.url`: `github.com/jlpartin/codemind.git` →
  `github.com/jlpartin/symbolwright.git`, matching the now-real repository
  location.
- `keywords`: added `symbolwright` alongside the existing `codemind` entry.
- `package-lock.json` was regenerated via `npm install` (never hand-edited)
  so its `name`/`version`/`bin` stay in lockstep with `package.json`.

**MCP identity:** `src/mcp/mcp-server.ts`'s `DEFAULT_SERVER_INFO` and
`src/mcp/mcp-client.ts`'s `CLIENT_INFO` both now report
`{ name: 'symbolwright', version: '0.2.0' }` in the MCP `initialize`
handshake (previously `codemind`/`0.1.0`). No dual-identity or `_meta`
compatibility field was added — the CLI invocation itself
(`codemind mcp-server` / `symbolwright mcp-server`, identical) is what
most MCP client configs actually pin, not the handshake name.

**CLI-invocation documentation reversal:** every literal
`codemind <subcommand>` example across source (usage/error strings) and
docs (README, `docs/**`) was updated to show `symbolwright <subcommand>`
as canonical — the exact reverse of the Phase 1–5 preservation regex, run
with the same subcommand list. `codemind <subcommand>` still works
identically and is called out as a working alias in the migration guide,
but is no longer the *documented* primary form.

**Identity-check source code:** `src/cli-doctor.ts`'s package.json check,
and `src/cli-release-readiness.ts`'s `PUBLIC_API_CONTRACT` and
`PACKAGE_BIN_CONTRACT` gates, now assert `pkg.name === 'symbolwright'` and
require all four bin entries (two canonical + two alias) to resolve
correctly. `PACKAGE_BIN_CONTRACT`'s bin-map comparison was changed from a
key-order-sensitive `JSON.stringify` equality check to an order-independent
comparison (`binMapsMatch`), since `npm install`-generated
`package-lock.json` doesn't guarantee the same key order as
`package.json` — this was a latent fragility in the gate, not new.

**Fixtures reflecting the real GitHub repository:** now that the repo
really is `JLPARTIN/SymbolWright`, `fixtures/github-write-executor-fixture.json`,
`examples/ajna/*.json` (4 files), and the `repo` field in
`fixtures/github-live-read-fixture.json` were updated to match — the CI
job display name reference (`"Validate CodeMind"` → `"Validate SymbolWright"`)
was already correct from Phase 1–5's CI workflow rename. The historical
branch name and file paths *inside* `github-live-read-fixture.json`
(reflecting a real, specific, already-closed PR from before this rebrand)
were deliberately left as-is — they're an accurate historical snapshot,
not the repo's current identity.

**Not changed in Phase 6** (still §12 of the Do-Not-Change ledger, §9):
`x-codemind-connector` header (external AELIB coordination still not
done) and the `cm-` session-ID prefix.

**Live verification mishap and recovery (process note, not a defect in
the shipped code):** while manually verifying the CLI's runtime behavior,
running `node dist/cli.js version`/`release-readiness` directly against
this repository's own working directory triggered the real
`.codemind` → `.symbolwright` migration logic against this repo's
*committed* `.codemind/` anomaly (§5), renaming those tracked files to
`.codemind.migrated` on disk. A subsequent cleanup command
(`rm -rf .symbolwright .codemind.migrated`) then deleted that renamed
directory. Because those files were already committed to git, `git
checkout -- .codemind/` fully restored them from HEAD with no data loss —
but this is a concrete illustration of why the migration logic is
filesystem-mutating and why manual CLI verification of this specific repo
should be done in an isolated temp copy, not the repo root, going
forward.
