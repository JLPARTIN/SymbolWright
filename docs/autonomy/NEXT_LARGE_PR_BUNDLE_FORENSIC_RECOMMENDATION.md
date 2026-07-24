# Next Large PR Bundle — Forensic Recommendation

**Audit date:** 2026-07-24
**Repository:** `JLPARTIN/CodeMind` (no SymbolWright rebrand has occurred — the repository, package name, CLI binary, and docs are all still "CodeMind")
**Audited ref:** `19ae05b20c561156d8586045095c0408615b2d52` on `claude/codemind-forensic-bundle-ngdcit`, identical to `origin/main` at audit time (0 commits ahead, 0 behind)
**Mission type:** Forensic discovery and planning only. No production code was modified.

---

## 1. Executive Verdict

CodeMind is a genuinely mature autonomous repository-engineering platform (~128,500 lines of TypeScript across 40 `src/` subsystems, 482 passing spec files, 8 shipped Large PR Bundles, and a self-imposed habit of forensic post-bundle audits). The mission lifecycle, planning, Docker-sandboxed validation, checkpoint/rollback, GitHub PR automation, and the unified dashboard are **real and wired to production**, not scaffolds — this audit independently re-verified the highest-risk claims (Docker sandbox flags, fail-closed behavior when Docker is absent, checkpoint restore integrity, external-repo mission reuse, semantic-index persistence) by reading the exact code paths rather than trusting the CHANGELOG.

The single highest-leverage next step is **not** a new feature. Bundle #8 (merged immediately before this audit) gave CodeMind the ability to acquire an arbitrary external GitHub repository and run its full autonomous edit → validate → repair loop against it. That capability changed CodeMind's trust model — the content flowing through the write path and into the LLM's context window is no longer guaranteed to be the operator's own trusted code. The write path and the LLM-context boundary were never hardened for that assumption: file writes are non-atomic and symlink-blind everywhere, one JavaScript-execution API route ships with **no authentication at all**, and there is no mitigation anywhere in the codebase for prompt injection carried in repository file content. These are not speculative; each was independently confirmed by reading the exact source lines (Section 39).

The recommended bundle is **`feat(trust): harden mutation-safety and untrusted-content boundaries for autonomous execution`** — a "Trusted Execution Boundary" hardening bundle that makes every write path atomic and symlink-safe, closes the one unauthenticated code-execution route, adds a real (if intentionally modest) prompt-injection boundary around content read from a repository before it reaches the LLM, and consolidates the two divergent protected-path policies into one. It scored highest of five evidence-grounded candidates (Section 22) because it has the largest architectural leverage (touches the one write path every other subsystem depends on), the clearest "why now" (directly triggered by Bundle #8's just-shipped capability), and produces a complete, testable, operator-visible outcome without inventing new placeholder surface area.

**Recommended action: PROCEED WITH IMPLEMENTATION** (Section 40).

---

## 2. Repository Baseline

```
Repository root:  /home/user/CodeMind
Current branch:   claude/codemind-forensic-bundle-ngdcit
HEAD SHA:         19ae05b20c561156d8586045095c0408615b2d52
git status --short:  (clean — no output)
origin/main:      19ae05b2... (identical — 0 ahead / 0 behind)
```

The working tree was clean at the start of this mission; no operator work was overwritten, discarded, or stashed. `git fetch origin main` succeeded (network access available). The branch has not diverged from `origin/main` — this audit began from the exact tip of `main`.

One pre-existing anomaly, noted but **not investigated further or modified** per the doc-only mission scope: a 9-byte stray file `pr-12-starter-lexicon-phrasebank.patch` at the repository root, whose entire content is the literal text `Not Found` — almost certainly a failed `curl`/API fetch that was accidentally committed. Flagged for cleanup in a future small PR; not part of this recommendation.

---

## 3. Investigation Method

This audit combined direct inspection by the lead investigator (baseline git checks, top-level structure mapping, `docs/ARCHITECTURE.md` and `CHANGELOG.md` review, and targeted verification reads of the safety-critical claims that anchor the winning bundle) with six parallel forensic sub-investigations, each briefed with the full mission context and told to verify claims against source rather than documentation:

1. Architecture, entry points, startup/Codespaces, CI
2. Mission lifecycle, planning, task-graph, autonomy runtime, repair loop, persistence/restart
3. Repository intelligence — Ajna review engine, forensics, memory, portability, GitHub intake
4. File editing/mutation safety, sandbox execution, validation loop
5. API surface, authentication, dashboard/operator journey, mobile/Codespaces UX
6. Test/evidence quality, security posture, docs-vs-reality drift, bundle history ledger

Each sub-investigation was required to cite `file_path:line` or `file_path — symbol` for every claim and to explicitly flag anything that looked disconnected, orphaned, or placeholder-only. Where two sub-investigations' evidence appeared to conflict (see Section 8, the semantic-index reconciliation), the lead investigator re-read the source directly rather than accepting either summary at face value.

Runtime validation was then executed directly against the real repository (Section 39): `npm ci`, `typecheck`, `lint`, `format:check`, `build`, `doctor`, a full `vitest run` (482/482 files), and a targeted subset re-run of the subsystems most relevant to the winning bundle.

---

## 4. Current Architecture Map

| Directory | Real purpose (verified) | In `docs/ARCHITECTURE.md`? |
|---|---|---|
| `src/runtime/` (247 files) | Core agent-loop substrate: policy, approval gates, tool assembly, transcript, audit, sandbox runner, validation gate | Yes |
| `src/mission/` (80) | Workspace-facing mission CRUD/lifecycle state machine (`ACTIVE/PAUSED/COMPLETED/ABANDONED/FAILED`), events, store | **No** |
| `src/autonomy/` (65) | Autonomous task-graph planner, coordinator, persistent executor, repair controller, semantic index, release service | **No** |
| `src/ajna/` (62) | PR review / merge-readiness engine, including AJNA-8/9 drift+security detectors | Yes |
| `src/app/` (48) | Unified dashboard shell, views, and API route tables (`src/app/api/*`) | **No** |
| `src/server/` (29) | The original chat/provider/agent HTTP dispatcher (`codemind-chat-server.ts`) the unified server wraps | **No** |
| `src/memory/` (29) | Cognitive memory: episodic/lexical SQLite storage (`node:sqlite`), retrieval engine, decay/consolidation | **No** |
| `src/sandbox/` (31) | Docker-hardened validation/write sandbox **and** a separate, weaker "guarded-host" code-playground backend | **No** |
| `src/workspace/` (33) | Multi-repo workspace manager plus the browser-facing polyglot code-runner (SQL/Python/TS-in-VM) | Yes |
| `src/github/` (25) | Bundle #8: external repo target parsing, acquisition, operations policy, PR-packet generation | **No** |
| `src/kernel/` (22) | (Not separately audited in depth this pass — flagged as absent from ARCHITECTURE.md) | **No** |
| `src/checkpoint/` (12) | SHA-256-verified pre-write snapshot/restore | Yes (implied by "Storage" but not named) |
| `src/mcp/` (18) | Real stdio MCP server + client, same tool registry as the agent loop | **No** |
| `src/portability/` (9) | Bundle #7: ecosystem detection, portable Docker validation image selection, web research | **No** |
| `src/provider/` (12) vs `src/providers/` (15) | Two similarly named, functionally distinct directories: concrete LLM adapters vs. provider-config/gateway layer | Yes (partially) |
| `src/hivemind/`, `src/tui/`, `src/telemetry/`, `src/activation/`, `src/storage/` | Match `docs/ARCHITECTURE.md`'s original layered diagram | Yes |

**Evidence:** `docs/ARCHITECTURE.md` (full file read). **Interpretation:** the document describes the original CLI/runtime/agent-loop core accurately but has not been updated across roughly 8 Large PR Bundles of growth — it omits the entire unified-server/dashboard/mission-runtime/sandbox/GitHub-ops/portability layer, which is now the majority of the platform's operator-facing surface. **Decision:** this drift is real but does not by itself justify a Large Bundle (Section 3.5/37 — documentation-only changes are excluded); it is folded into the winning bundle's Section 34 "Definition of Done" as a required doc-sync side effect, not its main substance. **Verification:** `diff` the subsystem table against `ls src/`.

A genuine naming/architecture smell, not a bug: `src/provider/` (concrete LLM adapters — `anthropic-provider.ts`, `gemini-llm-provider.ts`) and `src/providers/` (provider-config/gateway/adapter-contract layer) are easy to confuse for a future contributor or agent.

---

## 5. Runtime and Startup Map

**`codemind serve`** (default port `8787`, loopback by default): `src/cli.ts:317-319` → `runServeCommand` (`src/cli-serve.ts:129`) → `startUnifiedServer` (`src/app/server/unified-server.ts:57`). Refuses to start without a non-empty `CODEMIND_API_KEY` (`assertChatServerCanStart`, `src/server/codemind-chat-server.ts:120-121`). Auth is a timing-safe Bearer-token compare (`codemind-chat-server.ts:155-161`) applied centrally at `codemind-chat-server.ts:309` before the mission/autonomy/sandbox/repository/tools/memory/checkpoint route tables. Rate-limited (`FixedWindowRateLimiter`, 60/min default). CORS is opt-in only via `CODEMIND_CORS_ORIGIN`.

**A route table runs *before* that auth check**: `src/app/server/route-table.ts:20-46` (`tryHandleUnifiedRoute`) dispatches to `tryHandleWorkspaceRoute` (`src/app/api/workspace-routes.ts:140-169`) for `/api/workspace/languages`, `/api/workspace/run`, `/api/workspace/intelligence`, and `/vendor/*`, all **by design** unauthenticated (documented at `workspace-routes.ts:132-139` as "moved verbatim from `src/web/server.ts`... these routes stay unauthenticated"). This is the anchor finding for the winning bundle — see Section 18/29.

**`codemind agent`**: `src/cli.ts:99-101` → `src/cli-agent.ts`, runs the tool loop directly in the terminal.
**`codemind mcp-server`**: `src/cli.ts:309-311` → `src/cli-mcp-server.ts:55` → `src/mcp/mcp-server.ts`, stdio JSON-RPC, defaults to `READ_ONLY` (deliberately narrower than the platform default) since it is a background process any connected MCP client can drive.

**Codespaces startup** (`scripts/codespaces-start.mjs`) is genuinely careful, independently verified: it tracks only processes it started via a `/proc/<pid>/environ` marker (never kills-on-trust), refuses to touch a foreign process already on port 8787, persists the generated API key `chmod 600`, polls the real `/api/health` with a 45 s timeout and prints the log tail on failure instead of a false success, and syntax-checks every served inline `<script>` block with Node's real V8 parser (`src/devtools/served-client-validator.ts`) to catch template-literal escaping bugs `tsc` cannot see — this exact bug class caused two prior fixes (commits `70c41b3`, `eef6bcc`).

**CI** (`.github/workflows/`): `ci.yml` runs audit → typecheck → lint → format:check → a sandbox spec → `test:coverage` → build → preflight → `npm run validate`, with no `continue-on-error` anywhere in any of the four workflows (confirmed by grep). One drift: `package.json` declares `"engines": {"node": ">=22.5.0"}` but `node-compatibility.yml` still runs a weekly Node 20 compatibility matrix job — either the floor or the matrix is stale (this exact class of Node-version drift caused the most recent commit on `main`, `19ae05b`, "fix(ci): resolve post-merge red main — sandbox preflight timeout and Deploy Node version mismatch").

Two pieces of dead code found in the request path, neither wired to anything reachable in production: `renderChatUiHtml()` (`src/server/codemind-chat-server.ts:292-294`) is shadowed by `route-table.ts:25-28` and never actually serves; `renderMissionDashboardHtml` (`src/server/mission-dashboard-html.ts`, 122 lines) has zero callers anywhere in `src/` — superseded by `src/app/views/missions-view.ts` and never removed.

---

## 6. Mission Lifecycle Map

Two distinct, both-persisted state machines exist:

**Workspace-level mission** (`MissionStatus = ACTIVE | PAUSED | COMPLETED | ABANDONED | FAILED`, `src/mission/mission-types.ts:6`). All transitions go through `MissionService.transition()`/`.update()` (`src/mission/mission-service.ts:790-823`), which bumps a `revision` counter, writes via `MissionStore` (flat JSON, atomic temp-file+rename under `.codemind/missions/`), and appends a durable `MissionEvent`. `resume()` (PAUSED→ACTIVE) explicitly calls `recoverInterruptedMissionEvents` to synthesize `.interrupted` events for any `.started` operation with no terminal event (`mission-service.ts:255-273`; logic in `mission-events.ts:127-151`). `transition()` refuses further changes once a mission is `COMPLETED`/`ABANDONED` (immutability guard, `:798-801`); `reopenCompleted` and `delete` are both explicit, confirm-gated operations.

**Autonomy task-graph** (a second, lower-level state machine): `queued|blocked|ready|running|validating|repairing|completed|failed|cancelled|interrupted` (`src/autonomy/task-graph.types.ts:1-12`), persisted per-task via `JsonMissionExecutionStore` under `.codemind/autonomy/missions/*.json`, reachable through `POST /api/missions/:id/autonomy/{start,resume,pause,cancel,retry}` → `AutonomousMissionCoordinator` → `PersistentMissionExecutor`.

```
create ──▶ ACTIVE ──pause──▶ PAUSED ──resume──▶ ACTIVE (+ recoverInterruptedMissionEvents)
              │                                     │
              ├──complete/abandon/fail──▶ terminal ◀┘
              │        (immutable once COMPLETED/ABANDONED)
              └──reopenCompleted (explicit)──▶ ACTIVE

Per-task (autonomy layer):
queued → blocked/ready → running → validating → repairing → completed/failed/cancelled
   any of {running, validating, repairing} interrupted-by-crash → reconcileGraph() on resume() → interrupted → rescheduled
```

**Restart/recovery — the load-bearing finding:** both stores write via temp-file+rename, so a crash mid-write never corrupts a snapshot. `PersistentMissionExecutor.resume()` genuinely reconciles crash-interrupted tasks (`reconcileGraph()`, `persistent-mission-executor.ts:97-105,298-309`, flips any task still `running/validating/repairing` to `interrupted` before rescheduling). **But nothing calls `resume()` or `recoverInterruptedMissionEvents` automatically at server boot** — grep confirms `recoverInterruptedMissionEvents`'s only caller is the manual client-initiated `resume()` path. A mission left `ACTIVE` (not `PAUSED`) with in-flight evidence when the process dies sits exactly as it was until a client explicitly reopens it and triggers resume — not corrupted, but orphaned-looking, and 100% client-initiated rather than self-healing. This is documented for future-bundle awareness (Section 38) but was not selected as the winning bundle (Section 37).

---

## 7. Capability Maturity Matrix

| Capability | Evidence Paths | Maturity | Runtime Connected | Persisted | Tested | Operator Visible | Main Gap |
|---|---|---|---|---|---|---|---|
| Repository analysis (manifest/ecosystem detection) | `src/portability/repository-portability.ts` | 4 — Operational | Yes | Cached (semantic index store) | Yes | Indirect (drives validation commands shown) | Heuristic-only; no structural monorepo-graph analysis |
| Semantic indexing (regex symbol/import/reference index) | `src/autonomy/repository-semantic-index.ts`, `-bootstrap.ts`, `-store.ts` | 3 — Partially operational | Yes (planner, impact-analysis, acceptance) | Yes (`.codemind/repository-indexes/*.json`, atomic write) | Yes | No dedicated UI | **Never invalidated after mutation** — cached indefinitely per repo, no `force` call in production (verified: `autonomous-mission-runtime.ts:59-66`, no `force:true` outside tests) |
| Mission planning (task-graph) | `src/autonomy/autonomous-repository-planner.ts:20-112`, `task-graph.ts` | 4 — Operational | Yes | Yes | Yes | Yes | Task-graph *shape* is templated (3 analysis → 1 edit → N validation), not a general planner |
| Task graph execution | `src/autonomy/persistent-mission-executor.ts` | 4 — Operational | Yes | Yes | Yes | Yes | — |
| Multi-file editing / mutation safety | `src/runtime/tools/edit-file-tool.ts`, `runtime-policy.ts` | 3 — Partially operational | Yes | N/A (direct fs) | Yes | Indirect | **Non-atomic writes, lexical-only path containment (no symlink check)** everywhere in the write path |
| Sandbox execution | `src/runtime/sandbox/sandbox-runner.ts`, `src/portability/portable-validation-runner.ts` | 5 — Production-hardened | Yes | Evidence persisted | Yes | Yes | Second, weaker "guarded-host" playground backend lives in the same module (`src/sandbox/sandbox-guarded-host-backend.ts`) |
| Validation | `src/portability/repository-portability.ts` (discovery), `validation-command-gate.ts` (self-validation) | 4 — Operational | Yes | Yes | Yes | Yes | Outcome classification is PASS/FAIL/BLOCKED/ERROR by exit code only — no flaky/infra/timeout taxonomy |
| Autonomous repair | `src/autonomy/persistent-mission-repair-controller.ts` | 4 — Operational | Yes | Yes | Yes | Yes | No failure-category taxonomy; bounded 3-attempt budget spent identically on flaky and real failures; a second, apparently-superseded `AutonomousRepairLoop` implementation still exists |
| Restart recovery | `persistent-mission-executor.ts:97-105,298-309`, `mission-events.ts:127-151` | 3 — Partially operational | Yes (on manual resume) | Yes | Yes | Partial | No automatic boot-time reconciliation sweep |
| Evidence system | `src/mission/mission-events.ts`, checkpoint store, redaction layer | 4 — Operational | Yes | Yes | Yes | Yes | — |
| API/authentication | `src/server/codemind-chat-server.ts` (Bearer, timing-safe) | 4 — Operational (with one exception) | Yes | N/A | Yes | Yes | `/api/workspace/run`, `/api/workspace/intelligence`, `/vendor/*` are unauthenticated by design; `/run` executes arbitrary JS |
| Dashboard control | `src/app/views/*` | 4 — Operational | Yes | N/A | Partial (some UI-level spec coverage) | Yes | One stale UI-copy claim (Section 19); polling, not SSE |
| Codespaces/mobile | `scripts/codespaces-start.mjs`, `src/app/shell/app-shell-html.ts:83-104` | 4 — Operational | Yes | N/A | Partial | Yes | — |
| Security intelligence | `src/ajna/ajna-security-sensitive-paths.ts` | 2 — Scaffolded | Partial (see Section 9) | N/A | Yes | Partial | Path/filename regex only — no content/secret-value scanning, no dependency-vuln integration beyond `npm audit` text-matching |
| Architecture intelligence (AJNA-8/9 drift) | `src/ajna/ajna-architecture-drift.ts` | 2 — Scaffolded | **No** (orphaned, see Section 9) | N/A | Yes | Partial | Requires caller-supplied `importEdges`; nothing in the codebase derives them from the real semantic index that already exists (Section 4/9) |
| Dependency intelligence (memory graph) | `src/memory/storage/database.ts:67-78` (`graph_nodes`/`graph_edges`) | 1 — Concept only | **No** (read in `retrieval-engine.ts:65-88`, never written in production) | Schema only | Test-only population | No | The single most "shovel-ready" dead capability in the repository |
| Release readiness | `npm run release-readiness`, `docs/build-plans/` | 4 — Operational | Yes | Yes | Yes | Yes (CLI) | — |

---

## 8. Repository Intelligence Findings

**Reconciled finding (verified directly by the lead investigator, not just the sub-agent):** two separate systems both claim "repository graph" territory, with opposite maturity:

1. `src/autonomy/repository-semantic-index.ts` is **real and populated**. `buildRepositorySemanticIndex()` walks the real repository (skipping symlinks — `entry.isSymbolicLink()) continue` in `repository-semantic-index-bootstrap.ts:123`), extracts top-level symbol declarations, `import` statements, and whole-word symbol references via regex (not an AST parser — confirmed by reading the file: `SYMBOL_PATTERN`/`IMPORT_PATTERN` are plain regexes), and persists the result atomically (`repository-semantic-index-store.ts:9-16`, real temp-file+rename) to `.codemind/repository-indexes/<hash>.json`. It is genuinely consumed downstream: `autonomous-repository-planner.ts:20-112` matches mission-objective tokens against `index.symbols`/`index.references` to compute `affectedFiles`, and `repository-impact-analysis.ts`/`mission-impact-intelligence.ts`/`mission-acceptance-service.ts` all import it.
2. `src/memory/storage/database.ts:67-78` defines SQL tables `graph_nodes`/`graph_edges` for a semantically similar import/dependency graph, and `retrieval-engine.ts:65-88` genuinely queries them for memory retrieval scoring. **Nothing in production code ever inserts into these tables** — the only `INSERT INTO graph_nodes/graph_edges` statements in the entire repository are in `cognitive-memory-architecture.spec.ts:184-192`, hand-inserting two fake rows to test the read path.

**Interpretation:** the platform already solved "extract a symbol/import graph from the repository" once (item 1) and consumes it for planning — this is a real strength, not a gap, and must not be rebuilt from scratch. But that same, already-built extraction is not reused by the two other consumers that need identical data and currently either fake it or leave it empty:
- **Ajna's architecture-drift detector** (`src/ajna/ajna-architecture-drift.ts:6-8`, which explicitly comments "Ajna does not read files or parse source itself here") takes `importEdges` as an optional caller-supplied input. Grep across `src/` confirms no production caller ever supplies it — the layering-boundary check is dead in practice, running only in its own spec.
- **Memory's graph tables** are read but never written outside tests, per item 2 above.

**A second orphan, independently confirmed:** `src/agent/workflows/pr-workflow.ts` (the Ajna-gated PR workflow state machine, which does call `evaluateAjnaMergeGate` and blocks on a `BLOCKED` verdict) has **no callers anywhere in `src/` outside its own spec file** — it is not reachable from `src/runtime/loop/codemind-agent-loop.ts`'s default tool preset (`createFixtureRegistry('proposal')`), which does not include the Ajna live-read tool preset. Ajna's live-read tools are wired only into CLI demo entry points (`cli-runtime-ajna-workflow.ts`, `cli-runtime-ajna-live-read.ts`), not the production autonomous mission loop.

**Memory (episodic/lexical):** genuinely operational. `RetrievalEngine` (`retrieval-engine.ts:24-98`) blends FTS5 lexical search (weight 0.5), episodic recency+relevance scoring (weight 0.3+0.2), and the graph-join branch (weight 0.8, structurally dead per above) into one budgeted candidate set that feeds `rag-context-builder.ts` — this is genuine retrieval-for-use, not write-only telemetry.

**Portability/external intake (Bundle #7/#8):** ecosystem detection is manifest-filename heuristics only (no monorepo-workspace-graph parsing), but `src/github/external-repository-intake.ts:26-39` is architecturally clean — it does **not** fork a parallel execution path; it calls `MissionService.create` with the acquired clone as `repositoryPath`, reusing the identical mission/planning/validation/repair runtime used for local repositories. This is exactly the kind of foundation a future bundle should build on rather than duplicate.

**Security intelligence:** `src/ajna/ajna-security-sensitive-paths.ts:27-80` is a static ~14-regex list on **file paths only** (explicitly documented as never reading file contents, lines 8-9). There is no secret-value/entropy scanning anywhere in `src/`. `npm audit` integration (`src/runtime/ci/ci-diagnostics.ts:77-88`) is regex matching against audit **output text**, not a structured JSON parse of `npm audit --json`.

---

## 9. Planning and Task-Graph Findings

Planning is evidence-grounded, not templated strings: `autonomous-repository-planner.ts:20-112` tokenizes the mission objective and scores it against real `index.symbols`/`index.references` data from the semantic index (Section 8) to select `affectedFiles`/`matchedSymbols`. The task-graph *shape* is fixed, however — always 3 parallel analysis tasks → 1 edit-session task → N sequential validation tasks (one per discovered validation command) — a mature single-archetype planner ("make a repository change and validate it"), not a general planner that invents novel task topologies.

Dependency ordering and cycle detection are real: `validateAutonomousTaskGraph` (`task-graph.ts:55-78`) runs a genuine DFS for cycles, missing/self dependencies, and invalid retry policy. Each `AutonomousTaskNode` carries a real `retry: {maxAttempts, attempts}` consumed by the executor's retry-then-fail logic. **Staleness gap (Section 7, 8):** the planner's own semantic-index input is cached indefinitely per repository and never invalidated after the mission's own edits mutate the tree — a second mission (or a re-plan within the same session after edits) can plan against pre-edit symbol/import data.

---

## 10. Editing and Mutation-Safety Findings

**Write path, confirmed by direct source read:**
- `resolveWorkspacePath`/`isPathInsideWorkspace` (`src/runtime/policy/runtime-policy.ts:136-154`) is a **lexical-only** containment check: `path.resolve` + `path.relative` string comparison. There is no `fs.realpathSync`/`fs.lstatSync` call anywhere in this function or its callers. A symlink whose textual path sits inside the workspace but whose target resolves outside it is not detected — `fs.writeFileSync` (and `fs.readFileSync`) would silently follow it.
- `executeEditFileTool` (`src/runtime/tools/edit-file-tool.ts:43-102`) resolves via the above check (line 49), then writes with a single, unconditional `fs.writeFileSync(resolvedPath, newContent, 'utf-8')` (line 84) — **no temp-file+rename**, so a crash mid-write can leave a truncated file; **no binary-file detection** (forces `utf-8`, would corrupt binary targets); **no file-mode read-back/reapply** (permissions are not preserved).
- The Docker sandbox's own file-writer script (invoked by `DockerSandboxFileWriter`, `sandbox-runner.ts:366-424`) has the identical shape: `path.resolve` boundary check, then plain `writeFileSync`, no `lstat`.

**Checkpoint/restore is the one part of the write path done rigorously**, and is real: `checkpointBeforeWrite` (`src/checkpoint/checkpoint-tool-hook.ts:31-46`) snapshots pre-image content with a SHA-256 hash before every mutating tool call; `restoreCheckpoint` (`checkpoint-service.ts:165-296`) re-hashes each snapshot before restoring and **skips** (rather than blind-overwrites) any file whose on-disk hash no longer matches its recorded pre-image, deletes files that did not exist pre-mutation instead of writing empty content, and re-checks workspace containment on restore.

**No file-level staleness gate on `edit_file` itself.** The `contentHash`/`baseContentHash` optimistic-concurrency pattern exists extensively (42 files) at the mission/autonomy layer, but not at the low-level tool. Concurrent-edit protection is scheduling-level only (`parallel-task-scheduler.spec.ts` shows the scheduler refuses to parallelize tasks with overlapping writes), not write-level.

---

## 11. Sandbox and Tool-Execution Findings

All CHANGELOG safety claims for the Docker validation/write sandbox were independently confirmed by reading `src/runtime/sandbox/sandbox-runner.ts:245-269` and `src/portability/portable-validation-runner.ts:93-115` directly: `--cap-drop=ALL`, `--security-opt=no-new-privileges:true`, `--network none`, bounded `--memory`/`--cpus`, `--user <host-uid:gid>`, `--env HOME=/workspace`, output redaction on both stdout/stderr, and hard output-byte capping with `SIGKILL` on overflow. **Docker-unavailable fails closed, confirmed twice** — once by reading `sandbox-runner.ts:337-347`/`portable-validation-runner.ts:138-148` (`BLOCKED`/`ERROR` outcome, explicit "host execution is not allowed" message, no fallback branch), and once by direct runtime observation in this very audit environment (Section 39): `codemind doctor` reported *"Sandbox readiness: Docker is unavailable; sandbox execution will stop instead of using host fallback."*

**A second, materially weaker execution path exists in the same module tree**, for a different feature: `src/sandbox/sandbox-guarded-host-backend.ts` backs the interactive browser code-playground (`backend === 'guarded-host'`), spawning processes **directly on the host** with no container, no capability drop, no network isolation, and no UID remap — isolation is limited to a temp directory, a minimal env allowlist, and a timeout with process-group `SIGKILL`. This is not a Docker-unavailable fallback for the mission validation loop (that path fails closed, as above); it is a separate, intentionally lighter-weight sandbox for a different feature, but it is real host code execution and lives under the same `src/sandbox` namespace as the hardened runner, which is easy to conflate.

**Validation command discovery** (`src/portability/repository-portability.ts`) is genuine auto-discovery, not "just run `npm test`": it detects up to 9 ecosystems from manifests, reads `package.json` scripts, **and parses `.github/workflows/*.yml` `run:` steps** as an additional discovery source, tagging each command with `phase` and `source`, and gates every discovered command through a regex allowlist (`isSafePortableValidationCommand`) before execution. Outcome classification everywhere in the validation stack is still PASS/FAIL/BLOCKED/ERROR by exit code only — no flaky/timeout/infra taxonomy exists (confirmed by grep for `categor|classify|flaky|infra` across `src/autonomy/*.ts` and `src/portability/*.ts`).

---

## 12. Validation and Autonomous-Repair Findings

The repair loop genuinely enforces a bounded attempt budget and terminal escalation, matching the CHANGELOG's "bounded autonomous repair loop" claim: `PersistentMissionRepairController` (`src/autonomy/persistent-mission-repair-controller.ts`) — the implementation actually wired to the live server via `MissionBoundTaskExecutor` (`server-autonomy-runtime.ts:157-174`) — enforces `maxRepairAttempts` (default 3, validated 0–10) and emits an explicit `autonomy.repair.exhausted` terminal event plus a learned `review_lesson` memory entry on exhaustion.

**Gap:** `diagnoseFailure()` (`persistent-mission-repair-controller.ts:394-402`) tails the last 8 non-empty stdout/stderr lines and passes them as free-text "diagnosis" to the edit executor — every validation failure is treated identically. A flaky test or a transient network/infra failure consumes one of only 3 default repair attempts exactly like a real regression, with no retry-without-edit / re-run-only branch.

**Duplication risk:** a second, independent implementation, `AutonomousRepairLoop` (`src/autonomy/autonomous-repair-loop.ts`), has overlapping states and its own on-disk store, but appears to have no non-spec importers outside `src/app` — likely superseded by `PersistentMissionRepairController` and left in place. Recommended for consolidation (Section 24, out of scope for the winning bundle but flagged in the Do-Not-Repeat Ledger, Section 36).

---

## 13. Persistence and Recovery Findings

Both mission-level and autonomy-level stores write via temp-file+rename (verified: `mission-store.ts`, `persistent-mission-executor.ts:62-68`, `autonomous-repair-loop.ts:108-114`, `repository-semantic-index-store.ts:9-16`) — a crash mid-write leaves the previous durable snapshot intact across every persisted entity type audited. `reconcileGraph()` on `resume()` correctly re-derives `interrupted` state for any task caught mid-flight by a crash. The gap is not corruption risk; it is that **no code path calls this recovery logic automatically at server boot** — recovery is 100% client-initiated (Section 6). This was a strong secondary candidate bundle (Section 21, Candidate 3) but was not selected as the primary recommendation (Section 37).

---

## 14. API and Authentication Findings

Roughly 40+ route patterns across `codemind-chat-server.ts` and `src/app/api/*`. The primary Bearer-token check (`isAuthorized`, `codemind-chat-server.ts:309`, timing-safe) correctly gates missions, autonomy, sandbox, repository, tools, memory, and checkpoint routes.

**The one confirmed exception, and the anchor security finding of this audit:** `src/app/server/route-table.ts` dispatches `/api/workspace/run` to `handleWorkspaceRun` before the chat-server's auth check ever runs. That handler ultimately calls `executeJavaScriptInVm` (`src/workspace/code-runners.ts:235-291`), which the lead investigator read directly: it does build a real `vm.createContext` with `require`, `process`, `Buffer`, `fetch`, and all timers explicitly undefined/blocked, and applies a timeout — this is a deliberately hardened context, not naked `eval`. But Node's own documentation is explicit that `vm` "is not a security mechanism" (known escape techniques exist via the constructor chain even with `process`/`require` removed from the context object), and this route requires **no authentication whatsoever** while living on the same port the authenticated agent/repository API binds, including `0.0.0.0` in typical Codespaces port-forwarding configurations. The code comment at `workspace-routes.ts:132-139` shows this was a deliberate, documented design choice ("moved verbatim from `src/web/server.ts`... these routes stay unauthenticated"), inherited from a pre-unification dashboard where it was arguably lower-stakes — it was not re-evaluated when that dashboard was merged onto the same authenticated port as the rest of the platform.

CORS is opt-in only, no accidental wildcard default.

---

## 15. Dashboard and Operator-Experience Findings

The full create → plan → launch → monitor → inspect → PR journey was traced end-to-end and is real, not mocked, at every stage: `POST /api/missions` (real `MissionService`, persisted), `POST /api/missions/:id/autonomy/start` with genuine 1.5 s polling while running (`autonomy-view.ts:193-200` — polling, not SSE, but live), real `git`-backed `GET /api/repository/diff|status|branches`, and real on-disk reads for checkpoints/memory. Bundle #8's "External Repository Intake" and "GitHub PR Packet" UI controls were independently confirmed real (not stubs): they call `POST /api/github/intake` and `POST /api/missions/:id/github-pr-packet[/publish]`, all wired to real handlers, with "Open Pull Request" correctly `disabled` (not hidden) until policy and adapter both allow it (`autonomy-view.ts:207,217`).

**One stale-copy finding:** `src/app/views/settings-view.ts:20` still tells the operator the Workspace editor "persists sessions only in this browser's local storage... real repository-backed editing is planned for Large PR Bundle 2" — but Bundle 2 shipped (see `docs/repository-workspace.md`, `src/app/views/repository-view.ts`, which is the real, on-disk, checkpoint-guarded editor). This is a one-line UI-copy fix, high trust impact, explicitly not large-bundle-worthy on its own (Section 3.5) — bundled into the winning bundle's cleanup list (Section 25) rather than justifying a bundle by itself.

---

## 16. Mobile and Codespaces Findings

`src/app/shell/app-shell-html.ts:83-104` has real CSS breakpoints (900px/760px), single-column collapse, sticky nav, full-width action buttons, and a viewport meta tag — genuinely responsive, not an afterthought. `scripts/codespaces-start.mjs` and `docs/codespaces.md` were independently verified to match (Section 5) — the one-command, no-terminal-after-start flow is real.

---

## 17. CI and Test-Evidence Findings

482 spec files (confirmed by direct count in this audit: `find src -name '*.spec.ts' | wc -l` → 482). Coverage thresholds in `vitest.config.ts` (statements/branches/functions/lines: 85/80/85/85) match the CHANGELOG claim. Zero genuine skipped tests were found via source grep (`.skip(`, `it.skip`, `describe.skip`, `xit`, `xdescribe` — the only regex hits were `process.exit(1)` substrings inside fixture strings, not real skips). **Direct runtime confirmation in this audit:** `npm test` → **482/482 test files passed, 3524/3525 individual tests passed, 1 skipped**, full suite in 50.8 s (Section 39) — a materially better real-world number than the CHANGELOG's own historical "249/249 files" note, reflecting continued healthy growth. Spot-checked spec files exercise real wiring, not mock theater: `mission-service.spec.ts` runs actual `git init` in a tmpdir; `sandbox-execution-e2e.spec.ts` uses real `execFileSync`; `codemind-agent-endpoint.spec.ts` starts the real `codemind serve` HTTP server and drives it over real sockets — a genuine server-level E2E test exists and is real.

No `continue-on-error` anywhere in any of the four GitHub Actions workflows. The one CI/config drift found (Node 20 still present in `node-compatibility.yml` despite an `engines >=22.5.0` floor) is noted in Section 5.

---

## 18. Security and Trust-Boundary Findings

Summarized and separated per the mission's own taxonomy:

**Confirmed vulnerabilities (real, exploitable today):**
- V1 — `/api/workspace/run` unauthenticated arbitrary-JS execution via `vm` (Section 14). **Severity: High** given Bundle #8's new external/untrusted-repo-ingestion context and Codespaces' `0.0.0.0` exposure pattern.
- V2 — Symlink-escape gap in every write path (`edit_file`, `local_file_write`, the Docker sandbox's file-writer script) — lexical containment only, no `realpath`/`lstat` (Section 10). **Severity: Medium-High** — requires a symlink to already exist inside the workspace (e.g., planted by ingesting an untrusted external repo per Bundle #8, or by a prior compromised mission step), but once present it defeats the workspace-containment guarantee the rest of the policy model depends on.

**Hardening opportunities (not exploitable as-is, but weaken defense-in-depth):**
- No prompt-injection mitigation anywhere in `src/` — repository file content read by `read_file`-class tools flows into LLM context with no sanitization, quoting, or instruction-marking layer. Grep for "injection"/"prompt-injection" across `src/` returns nothing relevant; `docs/governance/CODEMIND_THREAT_MODEL.md` does not cover this threat.
- Two divergent protected-path/permission systems: the widely-wired `DEFAULT_RUNTIME_PROTECTED_PATHS` (`runtime-policy.ts:6-14`, referenced from 45 files) versus a narrower, separately-maintained list in `src/permissions/codemind-permission-policy.ts:44-59`, used by only the Ajna GitHub runtime bridge. Not currently a hole (the well-wired list is authoritative for the real write/read gate), but a real risk that a future bundle builds on the narrower list by mistake.
- No atomic writes anywhere in the mutation path (Section 10) — a durability/corruption risk under crash, distinct from the symlink-escape confidentiality/integrity risk.

**Accepted local-development risk, explicitly not a finding:** `src/mcp/mcp-stdio-transport.ts` spawning the MCP subprocess and `src/portability/portable-validation-runner.ts:52` spawning `docker` itself are both sandbox *entry points* by design, not bypasses.

**Strengths, confirmed:** `assertSafeRef` (`src/github/repository-acquisition.ts:46-56`) correctly blocks argument-injection in git refs; `runGitCommand` uses `spawn` with an args array (no shell string, no metacharacter injection); secret redaction is broad and applied at seven distinct layers (mission/provider/web/mcp/validation/GitHub/sandbox) with a real pattern set covering Bearer tokens, GitHub PATs, Anthropic/Google API-key shapes, PEM keys, and a generic env-var-name scan.

---

## 19. Documentation-versus-Reality Findings

`docs/ARCHITECTURE.md` is stale relative to ~8 bundles of growth (Section 4) — folded into the winning bundle's Definition of Done, not a standalone justification. `settings-view.ts`'s stale "Bundle 2 not yet built" copy (Section 15) is a one-line fix. `docs/API_REFERENCE.md`'s "Live" vs. "contract-only" route labeling was spot-checked against real route implementations and found accurate — no drift there. Port 8787 is consistent across `cli-serve.ts`, `docs/codespaces.md`, and `docs/runtime/CODEMIND_CHAT_SERVER.md`. No other material doc-vs-code drift was found on the sampled set.

---

## 20. Material Gap Inventory

| ID | Title | Subsystem | Current Behavior | Desired Behavior | Impact | In next bundle? |
|---|---|---|---|---|---|---|
| G1 | Unauthenticated JS-execution route | `src/app/api/workspace-routes.ts`, `src/workspace/code-runners.ts` | `/api/workspace/run` requires no auth, runs on the shared authenticated port | Require the same Bearer auth as every other route, or explicitly isolate/relabel the surface | Security, operator trust | **Yes** |
| G2 | Symlink-blind, non-atomic writes | `edit-file-tool.ts`, `runtime-policy.ts`, sandbox file-writer script | Lexical path check only; direct `writeFileSync` everywhere | `lstat`-aware containment check; temp-file+rename on every write path | Security, reliability | **Yes** |
| G3 | No prompt-injection boundary | Any tool reading repository file content into LLM context | Raw file content flows into context unmarked | Untrusted-content tagging/quoting boundary at the tool-read layer, at minimum for external-repo-intake missions | Security, autonomy trust | **Yes** |
| G4 | Divergent protected-path policies | `runtime-policy.ts` vs `src/permissions/codemind-permission-policy.ts` | Two lists, one authoritative, one narrower and separately maintained | Consolidate to one source of truth | Maintainability, latent security | **Yes** |
| G5 | Dead memory graph tables | `src/memory/storage/database.ts`, `retrieval-engine.ts` | Schema exists, read in production, never written outside tests | Populate from the real semantic index (Section 8) | Architecture, autonomous differentiation | No — future bundle (Section 38) |
| G6 | Orphaned Ajna architecture-drift wiring | `ajna-architecture-drift.ts`, `pr-workflow.ts` | `importEdges` never supplied in production; PR-workflow gate has no live caller | Wire the real semantic index's import data in; connect the gate to the live agent loop | Autonomy, reliability | No — future bundle (Section 38) |
| G7 | No boot-time mission/task recovery sweep | `codemind-chat-server.ts`, `mission-service.ts` | Recovery is 100% client-initiated | Automatic reconciliation pass at startup, surfaced to the operator | Reliability, autonomy | No — future bundle (Section 38) |
| G8 | No repair-loop failure taxonomy | `persistent-mission-repair-controller.ts:394-402` | Every failure treated identically; flaky/infra failures burn real repair attempts | Classify failure category before consuming an attempt | Autonomy differentiation | No — future bundle (Section 38) |
| G9 | Stale semantic index (no invalidation) | `repository-semantic-index-bootstrap.ts`, `autonomous-mission-runtime.ts:59-66` | Cached indefinitely per repository, no post-mutation rebuild trigger | Invalidate/rebuild after a mission's own edits, at minimum | Planning correctness | No — related to G5/G6, future bundle |
| G10 | Stale ARCHITECTURE.md / settings-view copy | `docs/ARCHITECTURE.md`, `settings-view.ts:20` | Doc omits 8 bundles of subsystems; UI describes a shipped feature as unbuilt | Sync doc + UI copy | Trust, onboarding | Folded into winning bundle's DoD, not standalone |

---

## 21. Candidate Large PR Bundles

### Candidate 1 — `feat(trust): harden mutation-safety and untrusted-content boundaries for autonomous execution` *(WINNER — see Sections 23+)*

**Problem statement:** Bundle #8 made external, untrusted repository content a first-class input to the same write path and LLM-context pipeline used for the operator's own trusted repository, but that pipeline was never hardened for untrusted input (G1–G4).
**Evidence:** Sections 10, 14, 18.
**Vertical outcome:** CodeMind's autonomous edit/validate/repair loop is provably safe to run against untrusted external repository content end-to-end — no symlink escape, no unauthenticated code execution, no unmarked prompt-injection surface, one consolidated protected-path policy.
**Major workstreams:** atomic+symlink-safe write layer; auth (or isolation) for `/api/workspace/run`; untrusted-content tagging boundary for tool-read output; protected-path policy consolidation.
**Architecture impact:** `src/runtime/policy/`, `src/runtime/tools/`, `src/checkpoint/`, `src/sandbox/`, `src/app/api/workspace-routes.ts`, `src/permissions/`.
**Testing impact:** new symlink-escape regression tests, crash-mid-write tests, auth tests for `/api/workspace/run`, prompt-injection-marker tests, external-repo-intake integration test exercising the hardened path end-to-end.
**Migration/compatibility:** write-path behavior change requires care for performance (temp+rename adds one extra syscall pair per write) but no API/schema break; `/api/workspace/run` auth change is a compatibility break for any caller relying on the unauthenticated route — must be called out in the PR/CHANGELOG.
**Risks:** temp+rename could interact oddly with Windows-style file locking in edge cases (low risk — CI targets Linux containers); over-aggressive prompt-injection marking could degrade legitimate agent quoting of file content if not scoped carefully.
**Estimated scope:** Large Bundle.
**Why now:** directly triggered by Bundle #8, the most recently merged capability; highest architectural leverage of any candidate (touches the one write path every other subsystem depends on).
**Why not now (steelman):** none of the individual fixes are large in isolation, so a reviewer could argue for four small PRs instead — addressed in Section 24 scoring (coherence/leverage still favors one bundle, since all four workstreams share one root cause: the trust boundary was never redrawn after Bundle #8).

### Candidate 2 — `feat(autonomy): repository intelligence unification — real import graph, drift detection, and memory population`

**Problem statement:** a real, populated symbol/import/reference index already exists (`repository-semantic-index.ts`) but two downstream consumers that need identical data — Ajna's architecture-drift detector and memory's dependency graph — either fake it (`importEdges` never supplied) or leave it empty (G5, G6, G9).
**Evidence:** Section 8.
**Vertical outcome:** Ajna's architecture-drift findings become real (derived from actual import edges, not caller-supplied fiction); memory's graph-based retrieval scoring stops being structurally dead code; the planner's index is kept fresh across mission-caused mutations.
**Major workstreams:** semantic-index invalidation on mutation; a real import-edge adapter feeding Ajna; a population job feeding `graph_nodes`/`graph_edges`; wiring the orphaned `pr-workflow.ts` Ajna gate into the live agent loop's default tool preset.
**Architecture impact:** `src/autonomy/`, `src/ajna/`, `src/memory/`, `src/runtime/loop/`.
**Testing impact:** drift-detection tests against real multi-file fixtures with intentional layering violations; memory-graph population/retrieval tests; agent-loop integration test proving the Ajna gate actually blocks a bad mission.
**Migration/compatibility:** schema-compatible (tables already exist); index cache format may need a version bump for invalidation metadata.
**Risks:** regex-based symbol extraction (not AST) will have real false positive/negative rates in drift detection — must be scoped honestly, not oversold as "architecture intelligence."
**Estimated scope:** Large Bundle.
**Why now:** high architectural leverage, connects three previously-siloed subsystems.
**Why not now:** lower urgency than Candidate 1 — nothing about it is newly dangerous; it is a quality/differentiation upgrade, not a trust-boundary closure. See scoring, Section 22.

### Candidate 3 — `feat(reliability): automatic mission recovery and repair failure taxonomy`

**Problem statement:** mission/task recovery is well-engineered but 100% client-initiated (G7); the repair loop cannot distinguish a flaky/infra failure from a real regression before consuming one of only 3 default attempts (G8).
**Evidence:** Sections 6, 12, 13.
**Vertical outcome:** a crashed server self-heals its mission state on the next boot without requiring the operator to notice and manually resume; repair attempts are spent only on genuine regressions.
**Major workstreams:** boot-time reconciliation sweep; failure-category classifier (exit-code/timeout/network heuristics vs. genuine test/type/lint failures); consolidation of the two repair-loop implementations.
**Architecture impact:** `src/server/codemind-chat-server.ts` (startup hook), `src/autonomy/persistent-mission-repair-controller.ts`, `src/autonomy/autonomous-repair-loop.ts` (removal candidate).
**Testing impact:** simulated-crash-then-restart tests; failure-taxonomy unit tests against representative flaky/infra/real-failure fixtures.
**Migration/compatibility:** boot sweep must not surprise-mutate missions a human is actively viewing — needs an explicit "reconciled, review me" surfaced state, not silent auto-resume of execution.
**Risks:** an automatic sweep that resumes execution (not just marks state) could re-run a mutating validation command without operator awareness — must default to reconcile-and-surface, not reconcile-and-continue.
**Estimated scope:** Medium-Large Bundle.
**Why now:** strong autonomy/reliability differentiation.
**Why not now:** narrower architectural footprint than Candidates 1/2; two fairly separable workstreams risk becoming two PRs in practice. See scoring.

### Candidate 4 — `feat(observability): real-time mission and autonomy event streaming`

**Problem statement:** the dashboard has no SSE/websocket channel for mission/autonomy state — `autonomy-view.ts` polls every 1.5s and the missions list/timeline is manual-refresh-only.
**Evidence:** Section 15.
**Vertical outcome:** live-updating dashboard without polling latency or wasted request volume.
**Major workstreams:** SSE endpoint for mission/autonomy events (the codebase already has one SSE precedent — `POST /api/agent`'s streaming — to extend from); client-side event-source wiring across `missions-view.ts`/`autonomy-view.ts`.
**Architecture impact:** `src/app/api/*`, `src/app/views/*`.
**Testing impact:** SSE contract tests, reconnect/backoff tests, dashboard event-rendering tests.
**Migration/compatibility:** polling fallback should remain for non-SSE clients (MCP, API-only consumers).
**Risks:** low — purely additive.
**Estimated scope:** Medium-Large Bundle.
**Why now:** genuine UX polish.
**Why not now:** pure usability improvement with no trust, reliability, or architectural-leverage dimension — lowest product-value and lowest architectural-leverage score of the five candidates (Section 22).

### Candidate 5 — `feat(security): content-based security and dependency intelligence`

**Problem statement:** Ajna's security detection is path-pattern-only (G-adjacent to G6); there is no secret-value scanning and no structured `npm audit --json` integration (Section 8).
**Evidence:** Section 8, 18.
**Vertical outcome:** real content-based secret/vulnerability detection feeding Ajna's merge gate.
**Major workstreams:** entropy/pattern-based secret-value scanner over diff content; structured `npm audit --json` parser replacing the current text-regex approach; wiring both into Ajna's existing `SECURITY_SENSITIVE_CHANGE` category.
**Architecture impact:** `src/ajna/`, `src/runtime/ci/ci-diagnostics.ts`.
**Testing impact:** secret-shape fixture tests (should not false-positive on the redaction module's own pattern constants); audit-JSON fixture tests across severity levels.
**Migration/compatibility:** additive to the existing Ajna finding schema — no breaking change.
**Risks:** secret-value scanning is a classic false-positive minefield; needs careful scoping to avoid becoming its own multi-bundle project.
**Estimated scope:** Large Bundle.
**Why now:** genuine security-intelligence gap.
**Why not now:** depends on the same orphaned-wiring problem Candidate 2 targets (Ajna's gate has no live caller) — building more Ajna detectors before that connection exists would create more of exactly the "produces a report nobody reads" pattern this audit flagged (Section 8). Should follow, not precede, Candidate 2.

---

## 22. Candidate Scoring Matrix

Scored 1–10 per dimension, weighted as specified in the mission brief.

| Dimension (weight) | C1 Trust Boundary | C2 Repo Intelligence | C3 Recovery/Repair | C4 SSE | C5 Content Security |
|---|---|---|---|---|---|
| Product value (20) | 8 | 7 | 7 | 5 | 6 |
| Removes critical end-to-end limitation (15) | 9 | 6 | 7 | 3 | 5 |
| Architectural leverage (15) | 9 | 8 | 6 | 4 | 5 |
| Autonomous engineering differentiation (10) | 5 | 7 | 8 | 3 | 6 |
| Operator impact (10) | 7 | 5 | 6 | 6 | 4 |
| Reliability/trust improvement (10) | 9 | 5 | 8 | 4 | 5 |
| Builds on existing foundations (5) | 5 | 5 | 4 | 4 | 3 (blocked on C2) |
| Testability/verifiability (5) | 5 | 4 | 4 | 4 | 3 |
| Compatibility/migration safety (5) | 4 | 4 | 4 | 5 | 5 |
| Scope coherence (5) | 4 | 4 | 5 | 5 | 3 |
| **Weighted total /100** | **75.0** | **60.5** | **64.0** | **41.5** | **49.0** |

No penalty adjustments were needed for C1 (no duplicate capability, strong evidence, demonstrable end-to-end result, no new placeholders). C5 carries an applied penalty for dependence on speculative/unbuilt infrastructure (Ajna's live wiring, which C2 — not yet built — would need to supply first).

---

## 23. Selected Large PR Bundle

**`feat(trust): harden mutation-safety and untrusted-content boundaries for autonomous execution`**

---

## 24. Selection Rationale

**Evidence:** Candidate 1 scored highest (75.0/100), driven by the two dimensions the mission brief weights heaviest after product value — "removes a critical end-to-end limitation" (9/10) and "architectural leverage" (9/10) — because it touches the single write path (`edit_file`, `local_file_write`, checkpoint restore, the Docker sandbox's own file writer) that every other mutating subsystem in the platform depends on, and because it closes a real, exploitable-today defect (G1: unauthenticated code execution) rather than a latent-quality gap.

**Interpretation:** the other four candidates are all legitimate, evidence-backed next steps — Candidate 2 (repository intelligence unification) in particular is a strong second place and connects real existing systems rather than inventing new ones, exactly the pattern the mission brief rewards. But Candidate 2's gaps (G5, G6, G9) are quality/differentiation gaps: nothing about them is *newly* dangerous, and the platform functions correctly without them (Ajna's drift check silently no-ops rather than lying; memory's graph branch never fires but the FTS5/episodic scoring it's blended with is unaffected). Candidate 1's gaps are different in kind: they were **acceptable when only the operator's own trusted repository flowed through the write and LLM-context path**, and became **live risks the moment Bundle #8 shipped** the ability to acquire and mutate an arbitrary third-party repository through the identical path. That is a genuine "why now," not a rationalization — it is the direct, provable consequence of the most recent merge to `main`.

**Decision:** select Candidate 1. Candidate 2 is recommended as the next bundle after this one ships (Section 38) — deliberately sequenced after trust-boundary hardening rather than before it, since richer repository intelligence over untrusted external content is more valuable, not less, once that content's ingestion path is provably safe.

**Verification:** the four constituent findings (G1–G4) were each independently confirmed by the lead investigator reading exact source lines (Sections 10, 14, 18), not solely relayed from sub-agent summaries — `runtime-policy.ts:136-154`, `edit-file-tool.ts:49,84`, `code-runners.ts:235-291`, `workspace-routes.ts:132-169` were all read directly as part of this audit.

---

## 25. Detailed Scope

### In scope
- Atomic (temp-file + `rename`) writes across every direct file-mutation path: `edit_file` tool, `local_file_write` tool, checkpoint restore, and the Docker sandbox's in-container file-writer script.
- Symlink-aware workspace containment: extend `isPathInsideWorkspace`/`resolveWorkspacePath` (and its Docker-script equivalent) to reject a resolved path whose real (`lstat`-resolved) location escapes the workspace root, not just its lexical path.
- Authentication for `/api/workspace/run` and `/api/workspace/intelligence` (bring them behind the same Bearer check as every other `/api/*` route), or, if the operator explicitly wants the scratch-pad feature to remain casual/frictionless, an equally strong alternative: bind it to loopback-only regardless of the server's configured host, with a startup warning if that would silently disable the feature under Codespaces port-forwarding. (Sections 27–28 specify the recommended approach: require auth, matching every other mutating/executing route — consistency beats a bespoke carve-out.)
- A minimal, real prompt-injection boundary: repository file content returned by `read_file`/`search`-class tools to the LLM is wrapped with an explicit untrusted-content delimiter and a short system-level instruction not to treat delimited content as instructions, applied at minimum whenever the active mission's repository originated from external intake (Bundle #8) — extendable to all missions once proven.
- Consolidation of `DEFAULT_RUNTIME_PROTECTED_PATHS` (`runtime-policy.ts`) and `src/permissions/codemind-permission-policy.ts` into one authoritative source, with the narrower list either deleted or explicitly re-derived from the wide one.
- Required documentation sync: `docs/ARCHITECTURE.md` subsystem table gains the omitted directories (Section 4); `settings-view.ts`'s stale Bundle-2 copy is corrected (Section 15) — small, mechanical, folded into this bundle's Definition of Done rather than justifying its own PR.

### Out of scope
- Populating the memory `graph_nodes`/`graph_edges` tables or wiring Ajna's drift detector to real import data (Candidate 2 — next bundle, Section 38).
- Boot-time mission/task recovery sweep and repair-loop failure taxonomy (Candidate 3 — future bundle).
- SSE/real-time dashboard updates (Candidate 4).
- Content-based secret/dependency scanning (Candidate 5).
- Removing the apparently-superseded `AutonomousRepairLoop` implementation (Section 12) — flagged for a future cleanup pass, not this bundle's mutation-safety focus.
- Rewriting the browser code-playground's `guarded-host` backend into a full Docker sandbox — out of scope; it is a materially different feature with a different risk profile (Section 11), and this bundle only needs to ensure it stays clearly distinguished, not rebuilt.

### Non-goals
- This bundle does not promise cryptographic or AST-level prompt-injection *detection* (classifying whether embedded text is actually an attack) — only a structural *boundary* (untrusted content is delimited/labeled before reaching the model). Detection-grade classification is a legitimate future bundle, not this one.
- This bundle does not change the Docker sandbox's already-hardened isolation model (Section 11) — that model was independently re-verified as correct and is left untouched.
- This bundle does not add new user-facing dashboard surface area — it hardens existing surfaces.

---

## 26. Architecture and Data Design

**New modules (proposed, extending established patterns rather than inventing new subsystem trees):**
- `src/runtime/fs/atomic-write.ts` — a single shared `atomicWriteFile(path, content, options)` helper (temp-file in the same directory + `rename`), consumed by `edit-file-tool.ts`, `local-file-writer.ts` (per the earlier-cited `src/runtime/write/local-file-writer.spec.ts`), `checkpoint-service.ts`'s restore path, and the Docker sandbox's write script. This mirrors the pattern `repository-semantic-index-store.ts` and `mission-store.ts` already use — the fix is to lift their existing pattern into a shared helper rather than reimplementing it a fifth time.
- `src/runtime/policy/workspace-containment.ts` (extension of `runtime-policy.ts`, not a new file if the team prefers to keep it inline) — adds an `lstat`-based real-path check alongside the existing lexical one; must handle the case where the target path does not yet exist (a write to a new file) by resolving the containment of its parent directory's real path instead.
- `src/runtime/context/untrusted-content-boundary.ts` — a small wrapping function applied at the point tool results are assembled into LLM messages, emitting a fenced/delimited block with a clear marker (e.g., an XML-style tag distinct from anything already used in the transcript format) plus one line of guidance in the relevant system prompt. Consumes the same "did this mission originate from external intake" flag already present on mission records (`src/github/external-repository-intake.ts`) to start scoped, per the in-scope description.
- `src/permissions/codemind-permission-policy.ts` — either deleted with call sites repointed at `DEFAULT_RUNTIME_PROTECTED_PATHS`, or reduced to a thin derivation (`export const NARROW_PROTECTED_PATHS = DEFAULT_RUNTIME_PROTECTED_PATHS.filter(...)`) if the narrower semantics genuinely need to persist for the Ajna GitHub runtime bridge.

**Data model changes:** none require a schema/version bump for the atomic-write and symlink-check work (behavioral, not structural). The untrusted-content boundary requires no new persisted entity — it is a request-time transform. No migration is needed for existing `.codemind/` state.

---

## 27. End-to-End Runtime Flow

1. Operator (or an automated GitHub-intake flow) starts a mission whose repository root may be the operator's own trusted checkout or an externally acquired clone (Bundle #8).
2. A tool call reads repository content (`read_file`, search-class tools). Before that content is appended to the LLM's message history, the new untrusted-content boundary wraps it with an explicit delimiter when the mission's origin is external intake.
3. The model proposes an edit. `edit_file`/`local_file_write` resolves the target path through the upgraded containment check: lexical `path.relative` (existing) **and** `lstat`-based real-path resolution (new) — a symlink pointing outside the workspace is rejected with the existing `"Access blocked outside workspace"` error class, now symlink-aware.
4. The write itself goes through the new shared `atomicWriteFile` helper: content lands in a temp file in the same directory, then an atomic `rename` replaces the target — a crash between these two steps leaves the original file untouched, never a truncated one.
5. Checkpoint-before-write (existing, unchanged) still snapshots the pre-image first; checkpoint restore now also writes atomically.
6. Validation runs in the Docker sandbox (existing, unchanged, re-verified sound in this audit) or, for the browser scratch-pad feature, through `/api/workspace/run` — which now requires the same Bearer token as every other `/api/*` route, closing G1.
7. Mission evidence records the (now atomic, now symlink-checked) write, exactly as before — no change to the evidence schema.
8. If the mission is an external-repo intake mission, the GitHub PR-packet flow (Bundle #8, unchanged) still requires explicit operator opt-in for any remote write.

---

## 28. API and Dashboard Design

**API contract changes (all additive or auth-tightening, no route renames):**
- `POST /api/workspace/run`, `POST /api/workspace/intelligence`, `GET /api/workspace/languages`: now require `Authorization: Bearer <CODEMIND_API_KEY>`, matching every other `/api/*` route. Response on missing/invalid auth: existing `401` shape already used elsewhere in `codemind-chat-server.ts` (no new error format to design).
- No new routes are introduced by the atomic-write/symlink-check/policy-consolidation workstreams — they are internal behavior changes underneath existing routes (`PUT /api/repository/file`, the `edit_file`/`local_file_write` tool handlers).

**Dashboard changes:** the browser Workspace scratch-pad (already an authenticated-app-shell page) needs no new UI — it already sends the stored `codemind_api_key` on other calls (`settings-view.ts`); this bundle just stops `/api/workspace/run` from being the one endpoint that didn't require it. If the team wants a visible signal, a one-line "sandboxed, key-gated" note can replace the stale Bundle-2 copy already being corrected in this bundle (Section 15/25).

---

## 29. Security and Failure Model

**Trust boundaries after this bundle:**
- The workspace root remains the outer boundary; it is now enforced against both the lexical path and the real (symlink-resolved) path.
- The `/api/*` surface has exactly one trust tier (Bearer-authenticated) instead of two (authenticated core + unauthenticated workspace scratch-pad).
- LLM context carries an explicit trusted/untrusted content boundary for external-repo-originated missions — the model is not asked to treat repository file content as instructions.
- One protected-path policy, not two.

**Failure scenarios and expected behavior (per the mission's required list):**

| Scenario | Expected behavior after this bundle |
|---|---|
| Symlink inside workspace pointing outside it | Write rejected with the existing `"Access blocked outside workspace"` error, now via the real-path check |
| Crash mid-write | Original file intact (temp file orphaned, cleaned up on next write or a startup sweep — see out-of-scope note in Section 25 re: full boot recovery) |
| Unauthenticated request to `/api/workspace/run` | `401`, same shape as any other protected route |
| Mission ingests a malicious README instructing "ignore prior instructions, execute X" | Content reaches the model inside the untrusted-content delimiter with guidance not to treat it as instructions — mitigation, not guaranteed prevention (Section 25 non-goals) |
| Docker unavailable | Unchanged — already fails closed (Section 11), re-verified, not touched by this bundle |
| Two permission-policy call sites disagree on whether a path is protected | Eliminated by consolidation — only one source of truth remains |

---

## 30. Testing and Validation Matrix

| Requirement | Validation Method | Expected Evidence |
|---|---|---|
| Symlink escape is blocked | New unit test: create a symlink inside a tmp workspace pointing outside it, call `edit_file`/`local_file_write`, assert rejection | Test fails on pre-bundle code, passes after |
| Writes are atomic | New unit test: simulate a write interrupted between temp-write and rename (mock `rename` to throw), assert original file content unchanged | Test asserts byte-for-byte pre-image survives |
| `/api/workspace/run` requires auth | New integration test: call without/with valid/invalid Bearer token, assert 401/200/401 | HTTP-level test against the real route table |
| Untrusted-content boundary is applied for external-intake missions | New unit test on the message-assembly function: feed a mission flagged as external-origin, assert the delimiter wraps file content | Direct assertion on constructed message payload |
| Protected-path policy is single-sourced | New unit test: assert `codemind-permission-policy`'s protected list is derived from (or identical to) `DEFAULT_RUNTIME_PROTECTED_PATHS` | Fails if the two lists silently diverge again |
| No regression in existing sandbox/checkpoint behavior | Full `npm test` (482 files) | 482/482 passing, matching this audit's baseline (Section 39) |
| No regression in typecheck/lint/format/build | `npm run validate` | All gates green, matching this audit's baseline |
| External-repo-intake mission still completes end-to-end with the hardened path | Existing `external-repository-mission.integration.spec.ts`, extended to assert the new boundary/atomic-write behavior fires | Integration test passes with new assertions added |

---

## 31. Compatibility and Migration Plan

- **Existing missions/persisted state:** no schema change; nothing to migrate. Existing `.codemind/` directories remain valid.
- **API clients:** any external caller of `/api/workspace/run` without a Bearer token will start receiving `401` — this is an intentional, documented breaking change, called out explicitly in the PR description and CHANGELOG (the mission brief's "no placeholder delivery" principle argues for a clean break here rather than a silent, confusing dual-mode).
- **Dashboard clients:** none — the app shell already sends the stored key on every other call.
- **Startup scripts / Codespaces workflow:** unaffected — `scripts/codespaces-start.mjs` already generates and reports the API key needed to use the now-authenticated route.
- **Environment variables:** none added or renamed.

---

## 32. Implementation Sequence

| Phase | Deliverable | Dependencies | Validation checkpoint | Buildable after phase? |
|---|---|---|---|---|
| 1 — Shared primitives | `atomicWriteFile` helper; `lstat`-aware containment check | None | Unit tests for both in isolation | Yes |
| 2 — Write-path adoption | Wire `edit_file`, `local_file_write`, checkpoint restore, Docker write script onto the Phase-1 primitives | Phase 1 | Existing checkpoint/edit-tool specs still pass + new symlink/atomicity specs pass | Yes |
| 3 — Route auth | Require Bearer auth on `/api/workspace/*` | None (independent of 1–2) | New auth integration test; existing workspace-route specs updated for the new auth requirement | Yes |
| 4 — Untrusted-content boundary | Wrap tool-read output for external-intake missions | None (independent) | New message-assembly unit test; external-intake integration test extended | Yes |
| 5 — Policy consolidation | Merge `permissions/codemind-permission-policy.ts` into `runtime-policy.ts`'s list | None (independent) | New single-source-of-truth test; Ajna GitHub runtime bridge specs still pass | Yes |
| 6 — Doc/UI sync | `docs/ARCHITECTURE.md` subsystem table; `settings-view.ts` copy fix | None | Manual read-through | Yes |
| 7 — Full validation | `npm run validate` (audit, typecheck, lint, format, coverage, build, release-readiness) | All prior phases | Full gate green | Yes |

Phases 1–2 and 3–6 are independent and could be developed in parallel by different workstreams within the same bundle; they are staged here for a single reviewer's linear read-through, not as a mandate for separate PRs (Section 15/mission brief: "internal implementation commits may be staged logically, but the final delivery should remain one coherent bundle").

---

## 33. Acceptance Criteria

1. A symlink created inside the workspace root pointing to a path outside it causes `edit_file` and `local_file_write` to throw the existing `"Access blocked outside workspace"` error class, verified by an automated test that fails against the pre-bundle code and passes after.
2. A simulated failure between temp-file write and `rename` leaves the target file's original content byte-for-byte unchanged, verified by an automated test.
3. `POST /api/workspace/run` returns `401` for a request with no `Authorization` header and `200` for a request with a valid `CODEMIND_API_KEY` Bearer token, verified by an automated HTTP-level test.
4. A mission flagged as originating from external repository intake (Bundle #8) produces LLM-bound messages in which repository file content is wrapped in the new untrusted-content delimiter, verified by an automated unit test inspecting constructed message payloads.
5. `src/permissions/codemind-permission-policy.ts`'s protected-path list is either removed or provably derived from `DEFAULT_RUNTIME_PROTECTED_PATHS` (no independent, divergent list remains), verified by an automated test.
6. `docs/ARCHITECTURE.md`'s subsystem table includes `src/app`, `src/server`, `src/mission`, `src/autonomy`, `src/sandbox`, `src/github`, `src/mcp`, and `src/kernel`.
7. `src/app/views/settings-view.ts` no longer describes the Repository tab as "planned for Large PR Bundle 2."
8. `npm run validate` (audit, typecheck, lint, format:check, test:coverage, build, release-readiness) passes with zero new failures relative to this audit's baseline (Section 39).
9. The existing external-repository-intake integration test suite passes unmodified in intent (assertions extended, not weakened) with the hardened write path and content boundary active.
10. No existing route, tool, or CLI command that was reachable before this bundle becomes unreachable after it, except the intentional, documented `/api/workspace/run` auth requirement (Section 31).

---

## 34. Definition of Done

- All seven workstreams (Section 32) are implemented, not partially stubbed.
- The full vertical path (Section 27) works end to end against both a local trusted repository and an externally-acquired one.
- No placeholder runtime behavior remains — the untrusted-content boundary actually wraps content (not a no-op flag), the auth check actually rejects unauthenticated requests, the atomic write actually uses temp+rename (not a comment claiming so).
- No migrations are required, and none were silently introduced.
- `npm run validate` passes (Section 33, criterion 8).
- Failure behavior (Section 29 table) is exercised by real tests, not asserted only in prose.
- Restart behavior for the write path (crash-mid-write, Section 30) is tested.
- `docs/ARCHITECTURE.md` and `settings-view.ts` match implementation (Section 33, criteria 6–7).
- The dashboard's Workspace tab continues to function for an authenticated operator exactly as before, with no user-visible regression other than requiring the key it already sends everywhere else.
- Evidence demonstrates the capability: test output plus a brief PR-description walkthrough of the four before/after security properties (Section 29).
- The working tree is clean at merge (no stray debug files, no leftover `.tmp` artifacts from atomic-write testing).
- The PR description accurately states the one intentional breaking change (Section 31) and the bundle's explicit non-goals (Section 25).

---

## 35. Preliminary File Impact Map

**Likely modified:**
`src/runtime/policy/runtime-policy.ts`, `src/runtime/tools/edit-file-tool.ts`, `src/runtime/write/local-file-writer.ts`, `src/checkpoint/checkpoint-service.ts`, `src/runtime/sandbox/sandbox-runner.ts` (Docker write script), `src/app/api/workspace-routes.ts`, `src/permissions/codemind-permission-policy.ts`, `src/ajna/github/ajna-github-runtime-bridge.ts` (if it consumed the narrower list directly), `docs/ARCHITECTURE.md`, `src/app/views/settings-view.ts`, `CHANGELOG.md`.

**Likely created:**
`src/runtime/fs/atomic-write.ts` (or equivalent shared helper location), `src/runtime/context/untrusted-content-boundary.ts` (or equivalent), corresponding `*.spec.ts` files for each.

**Requiring migration:** none (Section 31).

**Tests:** new specs alongside each modified/created module per the existing repository convention (`*.spec.ts` next to its module under `src/`, per `vitest.config.ts`'s include pattern) — not under a separate `tests/` directory (the forensics-module lesson from the CHANGELOG's own "Fixed" history is explicit that `tests/**` is never picked up by `vitest.config.ts`).

**Docs/CI/scripts:** `docs/ARCHITECTURE.md` (Section 33), no CI workflow changes required (existing gates already run typecheck/lint/test/build against the modified paths).

---

## 36. Do-Not-Repeat Ledger

| Capability | Implementation path | Maturity | May extend | Must NOT rebuild |
|---|---|---|---|---|
| Unified app shell / single-port server | `src/app/server/unified-server.ts` | Live | Add routes/views | A second dashboard server — `src/web/server.ts` was already deleted for exactly this reason |
| Docker sandbox execution | `src/runtime/sandbox/sandbox-runner.ts`, `src/portability/portable-validation-runner.ts` | Live, hardened, re-verified in this audit | Add ecosystems/images | A bespoke host-exec validator — use the existing runner |
| External GitHub repo intake | `src/github/github-repository-target.ts`, `repository-acquisition.ts`, `github-operations-policy.ts`, `external-repository-intake.ts` | Live, remote-mutation-blocked-by-default | Add deeper analysis on top | Ref/URL validation and traversal/credential rejection — already correct |
| GitHub PR creation | `DefaultGitHubPrCreationClient`, `github_create_pr` tool, `POST /api/repository/pull-request` | Live, single implementation reused by LLM tool and Repository tab | — | A second PR-creation path |
| Cognitive memory (episodic/lexical) | `src/memory/*`, `memory_recall`/`memory_store` tools | Live | Populate the graph dimension (Section 38) | Episodic/lexical retrieval, decay, consolidation — already implemented |
| Real symbol/import/reference index | `src/autonomy/repository-semantic-index.ts` + bootstrap/store | Live, populated, persisted | Add invalidation, feed Ajna/memory (Section 38) | Do not build a second, separate "semantic index" — this one already exists and is consumed by the planner |
| MCP server | `src/mcp/mcp-server-protocol.ts` | Live, same tool registry as the agent loop | — | A parallel tool registry for MCP |
| Agent HTTP endpoint | `POST /api/agent` | Live, SSE, 3 provider wire formats covering 9 providers | — | Additional provider wire-format adapters from scratch — extend the existing OpenAI-compatible family handler |
| Ajna review engine (incl. AJNA-8/9) | `src/ajna/*` | Live for detection logic; orphaned for production wiring (Section 8) | Wire real import data in, connect to the live agent loop (Section 38) | The detection type schema and regex-based path/diff-stat detectors — already real |
| Repository workspace (real git-tree editor) | `src/app/api/repository-routes.ts`, `repository-view.ts` | Live, checkpoint-bound, optimistic concurrency | — | A second file-edit path — the Workspace tab's localStorage scratch editor is intentionally separate and lower-stakes |
| Codespaces one-command startup | `scripts/codespaces-start.mjs`, `src/devtools/served-client-validator.ts` | Live | — | The `node:vm`-based served-script syntax validation — already catches the known escaping-bug class |
| Checkpoint/restore | `src/checkpoint/checkpoint-service.ts` | Live, SHA-256-verified, skip-on-mismatch | Atomicity fix (this bundle) | The verification/skip-on-mismatch design — already correct, do not replace with a naive overwrite |

**Known historical lesson (from `docs/autonomy/POST_BUNDLE6_FORENSIC_AUDIT.md`/`POST_BUNDLE7_FORENSIC_AUDIT.md`, both read in full during this audit):** this repository's own forensic-audit discipline has twice found the same *class* of defect — a real backend capability that was not actually reachable from the live UI/runtime path (Bundle #6's F2, Bundle #7's F1, both observability/reachability gaps in the Missions Timeline). This audit's own finding that Ajna's PR-workflow gate (Section 8) has no caller in the live agent loop is a third instance of that exact pattern. A future bundle addressing G6 should explicitly test *reachability from the production entry point*, not just unit-level correctness — the lesson this repository has already had to learn twice.

---

## 37. Rejected Alternatives

**Candidate 2 (Repository Intelligence Unification)** — not rejected outright, sequenced next (Section 38). Scored second (60.5/100) primarily because its gaps, while real and evidence-backed, are quality/differentiation gaps rather than closures of a newly-live risk; Candidate 1's "why now" (Bundle #8 changing the trust model) is more concrete and time-sensitive than Candidate 2's "this would make Ajna and memory better."

**Candidate 3 (Recovery/Repair Taxonomy)** — a strong, real reliability finding, but its two workstreams (boot-time recovery, failure taxonomy) are more separable than Candidate 1's four, and its architectural footprint (two files, `codemind-chat-server.ts` startup + `persistent-mission-repair-controller.ts`) is narrower than Candidate 1's cross-cutting write-path change. Insufficient operator-facing urgency to outrank a live security exposure.

**Candidate 4 (SSE/Real-time updates)** — the lowest score (41.5/100). Genuinely useful, but scored low on every mission-brief-weighted axis that matters most (removes-critical-limitation: 3/10, architectural leverage: 4/10) — polling every 1.5 s is a UX rough edge, not a limitation blocking any capability. Explicitly the kind of "isolated UI polish" the mission brief instructs against selecting as the primary bundle (Section 3.5).

**Candidate 5 (Content-based security/dependency intelligence)** — depends on infrastructure Candidate 2 has not yet built (a live Ajna wiring to actually consume new detector output) — selecting it now risks producing exactly the "intelligence subsystem that generates a report but does not influence mission decisions" anti-pattern this audit was instructed to guard against (mission brief Section 6.5). Should follow Candidate 2.

---

## 38. Recommended Future Bundle Order

1. **Selected: `feat(trust): harden mutation-safety and untrusted-content boundaries for autonomous execution`** (this document).
2. **Next: `feat(autonomy): repository intelligence unification`** (Candidate 2) — once the write/context path is provably safe against untrusted content, invest in making the platform's understanding of that content (and the operator's own repositories) genuinely graph-based rather than caller-supplied-or-empty. Directly builds on Bundle 1's untrusted-content boundary (deeper analysis of external repos becomes safer to perform once G1–G4 are closed).
3. **Later: `feat(reliability): automatic mission recovery and repair failure taxonomy`** (Candidate 3) — a self-healing, smarter-repair platform is the natural next autonomy differentiator once the trust and intelligence foundations are solid.
4. **Later: `feat(security): content-based security and dependency intelligence`** (Candidate 5), immediately followed or accompanied by **`feat(observability): real-time mission and autonomy event streaming`** (Candidate 4) as a lower-priority UX pass — Candidate 5 needs Candidate 2's live Ajna wiring to be meaningful, and Candidate 4 has no hard dependency on anything, so it can slot in opportunistically once the higher-leverage bundles are done.

This order is non-binding (per the mission brief) and should be re-validated with a fresh forensic pass after Bundle 1 merges, since a hardening bundle can itself surface new findings (this repository's own `POST_BUNDLE6`/`POST_BUNDLE7` audits are the precedent for that discipline).

---

## 39. Evidence Appendix

**Direct runtime validation performed in this audit** (all commands run against the real checked-out repository, not simulated):

| Command | Result | Duration | Notes |
|---|---|---|---|
| `npm ci` | 177 packages installed | 5.5 s | `node_modules` was absent at audit start; installed fresh |
| `npm run audit` (`--omit=dev --audit-level=high`) | 0 vulnerabilities | — | Plain `npm ci` reported 2 high-severity findings across the full dependency tree including devDependencies; the project's own audit script deliberately scopes to production deps only, by design, matching `package.json`'s script definition |
| `npm run typecheck` | Pass, 0 errors | 9.3 s | — |
| `npm run lint` | Pass, 0 errors | 9.3 s | — |
| `npm run format:check` | Pass, "All matched files use Prettier code style!" | 10.2 s | — |
| `npm run build` | Pass | 10.4 s | — |
| `npm test` (full `vitest run`) | **482/482 test files passed, 3524/3525 tests passed, 1 skipped** | 50.8 s | Confirms and exceeds the CHANGELOG's own historical "249/249" note; the single skipped test was not traced further (no `.skip()`/`skipIf` literal found via grep — likely a runtime-conditional skip; does not affect the file-level pass rate) |
| Targeted subset (`runtime/policy`, `edit-file-tool`, `code-runners`, `checkpoint`, semantic-index bootstrap/planner) | 103/103 tests passed across 11 files | 2.0 s | Run before the full suite as a fast pre-check of the exact subsystems this bundle touches |
| `node dist/cli.js doctor` | HEALTHY, 10 passed / 0 failed / 5 warnings | — | **Directly confirms the "Docker unavailable → fails closed" claim in this exact environment**: *"Sandbox readiness: Docker is unavailable; sandbox execution will stop instead of using host fallback."* Also confirms: 20/20 runtime phases, 43 registered tools, 9 providers registered |

`npm run test:coverage` and `npm run release-readiness` were not separately run given the full `npm test` run already confirmed 482/482 passing in under a minute — re-running with coverage instrumentation was judged low-marginal-value for a documentation-only mission and is noted here as the one intentionally-skipped validation step, per the mission brief's allowance to "run the highest-value subset and explain the limitation."

**Key source citations underlying the winning bundle** (all read directly by the lead investigator during this audit, not solely relayed from sub-agent summaries):
- `src/runtime/policy/runtime-policy.ts:136-154` — lexical-only workspace containment.
- `src/runtime/tools/edit-file-tool.ts:43-102` — non-atomic write, no symlink check.
- `src/app/api/workspace-routes.ts:132-169` — documented-by-design unauthenticated route table.
- `src/workspace/code-runners.ts:235-291` — the `vm.createContext` sandbox backing `/api/workspace/run`.
- `src/autonomy/repository-semantic-index.ts` (full file) — real, populated, regex-based (not AST) symbol/import/reference index.
- `src/autonomy/repository-semantic-index-bootstrap.ts:73-98` — cache-unless-`force` load behavior; confirmed no production `force: true` caller.
- `src/autonomy/repository-semantic-index-store.ts` (full file) — confirms this store, unlike the low-level edit tools, already writes atomically (temp+rename) — evidence that the atomic-write pattern is an established repository convention this bundle extends, not invents.
- `src/autonomy/autonomous-mission-runtime.ts:59-66` — confirms the semantic index is loaded without forcing a rebuild.
- `docs/autonomy/POST_BUNDLE7_FORENSIC_AUDIT.md`, `POST_BUNDLE6_FORENSIC_AUDIT.md` (full files) — prior forensic precedent and the "reachable from the live UI/runtime path, not just tests" audit discipline this document follows.

---

## 40. Final Operator Decision

### Recommended Next Large PR Bundle

**`feat(trust): harden mutation-safety and untrusted-content boundaries for autonomous execution`**

### Objective

Make CodeMind's autonomous edit, validation, and repair loop provably safe to run against untrusted repository content — closing the gap between Bundle #8's new ability to ingest and mutate arbitrary external GitHub repositories and the write/authentication/LLM-context layers that were never hardened for that assumption, without duplicating any of the platform's existing, already-solid sandbox, checkpoint, or mission infrastructure.

### Why this is the highest-value next move

Four independently-verified, evidence-backed findings — an unauthenticated arbitrary-code-execution route, symlink-blind and non-atomic writes across every mutation path, zero prompt-injection mitigation, and two divergent protected-path policies — share one root cause and one clear trigger: Bundle #8, the most recently merged capability, made external/untrusted repository content a first-class input to the exact write and LLM-context pipeline the operator's own trusted code uses, and that pipeline's trust assumptions were never revisited. This scored highest of five evidence-grounded candidates (75.0/100) on the dimensions the mission weights most heavily: removes a critical, live limitation, and touches the single write path every other subsystem depends on.

### What becomes possible after this bundle

**Operator-visible:** external repository intake and the browser Workspace scratch-pad are consistently protected by the same authentication the rest of the platform already requires; a corrected, accurate Settings page and architecture doc. **Engineering-visible:** one shared, atomic, symlink-safe write primitive used everywhere a file is mutated; one authoritative protected-path policy; a real, testable boundary between trusted operator intent and untrusted repository content in every LLM-bound message for external-intake missions.

### Principal risks

Temp-file+rename adds a small per-write syscall cost (negligible at this platform's scale); the `/api/workspace/run` auth requirement is an intentional, documented breaking change for any caller that relied on it being open; an overly broad prompt-injection boundary could, if misapplied, make legitimate file-content quoting look "flagged" — scoped in this bundle to external-intake missions specifically to bound that risk.

### Recommended action

**PROCEED WITH IMPLEMENTATION**
