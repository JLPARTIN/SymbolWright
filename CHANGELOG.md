# Changelog

All notable changes to SymbolWright (formerly CodeMind) are documented in this file.

## [Unreleased]

### Fixed

- **Network and operational hardening (Bundle #12 PR 5)**: adds explicit local/hosted deployment modes; fail-closed non-loopback plaintext behavior; direct-TLS or trusted-reverse-proxy HTTPS enforcement; right-to-left trusted X-Forwarded-For resolution with IPv4-mapped IPv6 normalization; strict rightmost forwarded-protocol validation and conflict rejection; coarse public /readyz plus operator-only readiness detail and metrics; startup boot sweeping for stale missions, sandbox corruption, and external-repository retention; hosted-mode startup refusal when the governance ledger, process concurrency caps, or delegated-agent execution/session/cost limits are missing.

- **GitHub repository intake — grant attribution and mission-create authorization bypass**:
  `POST /api/github/intake` was gated only by the low-level `symbolwright.repository.index`
  capability, so a read-only Repository Analyst grant (no `symbolwright.mission.create`) could
  reach `read-only`/`writable` intake modes and have SymbolWright acquire a real external
  repository and create a real mission — bypassing that profile's write restriction entirely.
  The created mission was also never attributed to the calling grant (`missionService.create` was
  invoked without a `grantId`), so `executionLimits.maxConcurrentMissions` and other per-grant
  execution limits could not apply to missions created through intake. Intake now requires
  `symbolwright.mission.create` (checked via the same `AuthorizationService`, and enforcing the
  same concurrent-mission limit as `POST /api/missions`, via a new shared
  `src/access/mission-concurrency-guard.ts`) for any non-`dry-run` mode, and threads the
  authenticated grant's ID through `performExternalRepositoryIntake` into the created mission.
- **Legacy `.codemind` exclusion typo**: three places meant to exclude both the canonical
  `.symbolwright/` runtime-state directory and the legacy pre-rebrand `.codemind/` directory
  instead repeated `.symbolwright` twice, so a repository still carrying `.codemind/` state could
  have it swept into a real commit, a generated GitHub PR packet, or the semantic-index bootstrap
  scan: `POST /api/repository/commit`'s default `git add -A` exclusions
  (`src/app/api/repository-routes.ts`), the intake PR-packet changed-file filter
  (`src/app/api/github-intake-routes.ts`), and the repository semantic-index directory ignore list
  (`src/autonomy/repository-semantic-index-bootstrap.ts`). Also corrected the same duplicate in
  `src/autonomy/transactional-edit-session.ts`'s unsafe-edit-path check. Added regression tests
  proving `.codemind/` content is never staged, committed, or included in a PR packet.
- **`executionLimits.requirePullRequest` was declared but never enforced**: a grant could set
  `requirePullRequest: true` (the Coding Agent and Repository Analyst profile default) and a
  mission it owns could still be marked `COMPLETED` with zero pull requests ever created against
  it — the flag had no code path checking it anywhere. `POST /api/missions/:id/complete` now
  refuses with `403 PULL_REQUEST_REQUIRED` when the owning grant requires a pull request and
  `mission.references.pullRequestUrls` is empty, via a new shared
  `src/access/require-pull-request-guard.ts`. Also fixed the one real, GitHub-API-verified
  PR-creation path (`POST /api/missions/:id/github-pr-packet/publish`) to actually call
  `MissionService.recordPullRequest` on success — previously it recorded only an event, never
  updating `references.pullRequestUrls`, so even a real published PR wouldn't have satisfied this
  gate once it existed.
- **`AccessGrantService.narrowGrant` could widen a grant despite its one-directional contract**:
  the method's own doc comment says a PATCH "can never add a capability, widen repository/branch
  scope, or extend expiry," but `executionLimits`/`sessionLimits`/`clientConstraints` were merged
  with a plain `{ ...current, ...patch }` object spread, which accepted a _larger_
  `maxConcurrentMissions`, a _longer_ `maxSessionDurationMinutes`, flipping `allowDirectPush` from
  `false` to `true`, flipping `requirePullRequest` from `true` to `false`, adding new entries to
  `allowedCommands`/`allowedIpCidrs`/`allowedClientIds`, or clearing an existing IP/client
  allowlist by replacing it with an empty one. New `src/access/grant-narrowing.ts` makes every
  field's "stricter" direction explicit (smaller is stricter for numeric caps; allow-flags like
  `allowDirectPush` can only go true→false; require-flags like `requirePullRequest` can only go
  false→true; allowlist arrays can only shrink to a subset, and an empty replacement is rejected
  when the current list is non-empty) and `narrowGrant` now rejects any patch that would widen
  instead of silently accepting it.
- **`POST /api/repository/branches` never validated the requested branch name against the calling
  grant's `branchScope`**: the route-level authorization dispatch in `symbolwright-chat-server.ts`
  resolves branch context (for the `branchScope.allowedPatterns`/`deniedPatterns` check) from the
  _currently checked-out_ branch, before the request body is read — irrelevant for branch
  _creation_, since the branch being created doesn't exist yet, and `repo.branch.create` wasn't
  even in the route-level set that triggers that resolution. `AuthorizationService`'s branch-scope
  check only runs when a branch is present on the request, so it was silently skipped entirely,
  and the route handler's own check (`evaluateGitToolRequest`) only consults a fixed global
  denylist (`main`, `master`, ...), never the grant's configured `branchScope`. In effect, a grant
  restricted to `feat/**`/`fix/**`/`symbolwright/agent/**` could create a branch under any other
  name — `release/**`, a `deniedPatterns` entry, anything not in the small hardcoded list — with no
  per-grant scope check applied at all. The branch-scope decision logic is now factored into a
  shared `src/access/branch-scope-guard.ts` (also used by `AuthorizationService` internally, so
  there's one implementation instead of two that can drift), and
  `POST /api/repository/branches` now re-checks the grant's `branchScope` against the actual
  requested name once the body is parsed.
- **`executionLimits.sandboxNetworkAccess: true` was silently stored but never honored**: the
  sandbox runner (`src/runtime/sandbox/sandbox-runner.ts`) only ever executes with `network:
none` — there is no code path anywhere that grants a sandboxed process network egress. Setting
  `sandboxNetworkAccess: true` on a grant (at creation or via `narrowGrant`) would have let an
  operator believe network access had been enabled when nothing downstream honored it.
  `POST /api/v1/access-grants` and `PATCH /api/v1/access-grants/:id` now reject `true` explicitly
  with a validation error instead of storing it silently.
- **`FixedWindowRateLimiter` never forgot a key**: every distinct IP address or grant ID that ever
  made a request stayed in its internal `Map` for the lifetime of the process, even long after
  that key's rate-limit window expired — unbounded memory growth under a large stream of unique
  callers. It now sweeps expired entries once the map grows past a threshold (10,000 keys), so
  memory is bounded by actual concurrent traffic within a window rather than all traffic the
  process has ever seen.
- **CI supply-chain hardening**: the Dependency Review workflow's `continue-on-error: true` was a
  workaround for a "not supported on this repository" failure that a live CI run confirmed no
  longer happens (Dependency Review now runs a real scan and reports actual results) — removed the
  escape hatch so a genuine high-severity dependency vulnerability or a denied license can now
  block a PR, instead of only ever being advisory. The Deploy and Publish workflows now use
  `npm ci` instead of `npm install`, matching the CI workflow, so release and container builds
  install exactly what the committed lockfile specifies rather than potentially re-resolving
  dependency versions at build time.
- **`Publish` could produce a confusing failed CI run on a normal release**: the workflow fires on
  both a `v*.*.*` tag push and a GitHub Release being published, and a normal release process
  triggers both for the same version. Since npm registry versions are immutable, the second run's
  `npm publish` would fail outright once the first had already succeeded — a red, non-actionable
  CI run with no real problem behind it. It now checks whether the version is already live on the
  registry first and skips the publish step gracefully instead of erroring.
- **Dockerfile base images were unpinned floating tags**: both build stages used `node:22-alpine`
  (a tag Docker Hub can repoint at any time) rather than a specific image digest, so a rebuilt CI
  run could pull different bytes than a previous one without any change to this repository. Pinned
  both stages to the current `node:22-alpine` manifest-list digest
  (`sha256:16e22a55...`, verified directly against the registry). Added `.github/dependabot.yml`
  (npm, GitHub Actions, and Docker ecosystems) so this pin — and dependency/Action versions more
  generally — get automated update PRs instead of silently going stale; a digest pin with no
  update mechanism would otherwise permanently freeze out upstream OS-level security patches.
- **GitHub Actions referenced by moving major-version tags**: every workflow used tags like
  `actions/checkout@v4` — a tag the action's maintainer can repoint to a different commit at any
  time, so a workflow's actual behavior wasn't fully pinned to what was reviewed. All actions
  across all five workflow files (`actions/checkout`, `actions/setup-node`,
  `actions/dependency-review-action`, `docker/setup-buildx-action`, `docker/login-action`,
  `docker/metadata-action`, `docker/build-push-action`) are now referenced by the exact commit SHA
  the currently-used major-version tag resolves to (verified via `git ls-remote` against each
  action's repository), with the human-readable version kept as a trailing comment. Covered by the
  same new `.github/dependabot.yml` `github-actions` ecosystem entry, so these pins get automated
  update PRs going forward rather than silently drifting from what's actually reviewed.
- **No static application security scanning**: the audit found no CodeQL workflow or configuration
  anywhere in the repository, so no analysis engine was catching injection, path-traversal, or
  similar code-level vulnerability patterns in TypeScript source before merge — only dependency
  vulnerabilities were covered (Dependency Review). Added `.github/workflows/codeql.yml`, running
  CodeQL's `javascript-typescript` analysis on every push to `main`, every PR, and weekly on a
  schedule. Verified the repository is public, so this runs under GitHub's free Advanced Security
  tier for public repos — no paid GHAS license required. Actions pinned to commit SHAs, matching
  every other workflow.
- **No resource-instance ownership check on mission-linked routes (Bundle #12 PR 1)**: every
  mission-linked surface checked only that a caller held the right _capability class_ (e.g.
  `symbolwright.mission.read`), never that the specific resource belonged to them. A delegated
  grant could read, mutate, or control another grant's missions by simply supplying that
  mission's id: `GET /api/missions` returned every mission unfiltered; `handleAutonomousMissionRoute`
  (dispatched from `mission-routes.ts` before any ownership check) received no `grantId` at all, so
  `start`/`resume`/`pause`/`cancel`/`retry` had no notion of caller identity; `POST /api/agent`
  loaded a caller-supplied `missionId` and let the turn proceed with zero ownership comparison;
  sandbox execution (`POST /api/sandbox/execute`, including standalone runs with no `missionId`)
  and its history had no grant attribution whatsoever; checkpoint listing/detail had no ownership
  check; `MissionService.import()` spread the exported bundle's `grantId` wholesale into the
  imported record, carrying over a stale foreign grant id; and `TeamService.listTeams()`/`getTeam()`
  had no notion of caller identity either, with `AgentTeam` having no owner grant/principal field
  at all and team creation accepting a caller-supplied `repositoryRoot` instead of deriving it from
  the verified mission. New `src/access/mission-access-guard.ts` (`canAccessMission`,
  `resolveMissionVisibility`) and `src/access/team-access-guard.ts` (`checkTeamAccess`) establish
  one shared relationship/operation model — `operator | mission_owner | team_owner | team_member |
none`, checked against `read | contribute | execute | manage | destructive` — applied uniformly
  across missions, autonomy actions, `/api/agent`, sandbox executions (with new
  `SandboxExecutionOwnership` tracking on every history record), checkpoints, mission import
  (grantId now stripped and reassigned to the importing caller), and the full `/api/v1/agent-teams`
  surface (including anti-impersonation: `agentId`/`reviewerId` are now derived from the caller's
  own active team-member record rather than trusted from the request body). Cross-grant denials
  return `404` (relationship `none`) rather than `403`, to avoid confirming a resource's existence
  under a different owner. Repository memory (`GET /api/memory/recent`/`/procedural`) is
  operator-only for now, since the underlying schema has no repository/mission/grant scoping key at
  all — a policy decision recorded explicitly rather than left implicit.
- **No cancellation, and no graceful shutdown, for in-flight autonomous execution (Bundle #12
  PR 2)**: an operator's `pause`/`cancel` only updated the persisted mission record — the
  in-process autonomy loop kept running its current task to completion, unaware anything had
  changed, and could then overwrite the just-written cancellation with its own stale in-memory
  result once it finished. There was also no signal path from a `pause`/`cancel` into
  `runAgentLoop` or `PersistentMissionExecutor.run()` at all, and process shutdown
  (`SIGTERM`/`SIGINT`) did nothing but wait forever (`await new Promise<never>(...)`), so
  in-flight requests and executions were simply severed rather than drained. New
  `src/autonomy/mission-execution-abort-registry.ts` (`MissionExecutionAbortRegistry`,
  `registerIfAbsent`/`release`/`requestAbort`/`requestAbortAll`, injected rather than a bare
  module singleton) and `src/autonomy/mission-execution-lock.ts` (`MissionExecutionLock`, a
  per-mission-key FIFO async mutex) are now shared by both `PersistentMissionExecutor` and
  `AutonomousMissionControl`. Every read-modify-write around a task's start/finish and around
  `pause`/`cancel` runs inside that lock and reloads the freshest persisted state immediately
  before writing, so **cancellation always wins**: if a task's own completion is still in flight
  when a concurrent `cancel` lands, the task's result is discarded rather than clobbering the
  cancelled state. `AGENT_LOOP_STATUSES` gains `'cancelled'`, and an `AbortSignal` is threaded
  from the abort registry through the coordinator, the executor, `MissionBoundTaskExecutor`,
  `RuntimeMissionTaskExecutor`, and `AgentLoopAutonomousEditExecutor` into `runAgentLoop` itself,
  which now checks `config.signal?.aborted` at the top of its loop and returns
  `status: 'cancelled'` with whatever usage/messages/iterations had already accumulated
  (threading the signal into an already-in-flight provider SDK call is a deliberate, disclosed
  non-goal of this PR). A duplicate `start`/`resume` on an already-running mission now throws
  `MissionAlreadyRunningError` instead of silently starting a second concurrent execution loop.
  Also fixes the "no graceful shutdown" half of the same problem: new
  `src/app/server/http-bootstrap.ts` (`createAndStartHttpServer`, `ShutdownLifecycle`) is shared
  by both `startChatServer` and `startUnifiedServer`, draining connections and force-destroying
  any still-open sockets after a bounded grace period; `ShutdownLifecycle.onBeforeShutdown` lets
  `mission-routes.ts` register an abort-all-missions hook the first time it constructs an
  autonomy runtime, without the HTTP layer needing to know autonomy exists. `symbolwright serve`
  (`cli-serve.ts`) now handles `SIGTERM`/`SIGINT` by calling `server.close()` instead of blocking
  forever, with a second signal during the grace period forcing an immediate exit.
- **External repository intake had no size/count/time caps and no cleanup on most failure paths
  (Bundle #12 PR 3)**: `acquireExternalRepository`/`duplicateLocalRepository` cloned into
  `.symbolwright/external-repos/` with no limit beyond a 120s per-subprocess timeout, so a large
  or hostile external repository could exhaust disk space, and a clone/checkout/verification
  failure left the partial destination directory behind on disk with nothing to clean it up.
  Non-`dry-run` acquisitions now enforce, via new `src/github/repository-workspace-fs.ts` and
  cap-checking in `repository-acquisition.ts`: git object count and packed/unpacked byte size
  (`git count-objects -v`), total checked-out workspace byte size, file count, and max individual
  file size (a bare `count-objects` check alone misses working-tree files and LFS content), an
  overall acquisition wall-clock budget, and up-front free-disk headroom before any clone I/O
  starts. `GIT_LFS_SKIP_SMUDGE=1` is now set unless a caller explicitly opts in. Every failure
  path — clone failure, checkout failure, verification failure, a cap violation, and (in
  `external-repository-intake.ts`) profile-building or mission-creation failure — now deletes the
  partial destination via a symlink-safe deletion helper that `lstat`s the candidate first (a
  symlinked destination is unlinked directly and never traversed) and, for a real directory,
  confirms its canonical path stays inside the controlled acquisition root before recursing.
  New `src/github/repository-acquisition-retention.ts` adds two-phase quarantine-then-delete
  retention for acquired workspaces no longer needed: a workspace is only prunable once **no
  retained mission at all** references it (not just no `ACTIVE` mission, since a paused, failed,
  completed, or imported mission may still need its repository for reopening, export, or audit);
  quarantined workspaces are rechecked for new mission references immediately before their actual
  deletion and restored if one appeared during the grace window; a shared
  `src/github/acquisition-root-lock.ts` mutex serializes intake against retention sweeps so a
  workspace can never be quarantined in the window between its acquisition finishing and the
  mission that will reference it actually being created. New operator command
  `symbolwright prune-repos` (`--quarantine-only`/`--finalize-only`/`--json`) runs the sweep
  on demand.
- **No durable usage/cost ledger, and `AgentLoopResult.totalUsage` was dropped on the floor
  entirely (Bundle #12 PR 4)**: `recordAgentResult` never captured provider token/cost usage, so
  no mission ever recorded what it actually spent, and there was no enforcement path at all for a
  delegated grant's spend — the only existing money math (`src/telemetry/cost-tracker.ts`) was a
  float-based, display-only CLI summary never wired into any budget decision. New
  `src/access/microdollars.ts` establishes `bigint` microdollars as the sole representation used
  in any enforcement or comparison, with `serializeMicrodollars`/`parseMicrodollars` as the one
  codec pair every JSON/HTTP boundary uses (`bigint` never crosses one directly — `JSON.stringify`
  throws on it). New `src/access/fixed-cost-rates.ts` (`computeFixedCostMicrodollars`) mirrors
  `DEFAULT_COST_RATES`' models as fixed-point microdollar rates with ceiling rounding, throwing
  `UnknownModelRateError` for an unpriced model rather than silently guessing — the existing float
  `computeCost`/`DEFAULT_COST_RATES` path is untouched and stays display-only. New
  `src/access/governance-store.ts` (`GovernanceStore`, SQLite via `node:sqlite`, WAL mode,
  `0o600`) holds four tables — durable rate-limit windows, per-mission usage, per-grant daily
  totals, and a `usage_reservations` ledger — with a transactional reserve-then-settle flow:
  `reserveUsage` (server-generated `reservationId`, an optional client idempotency key unique only
  within its own `grantScope`) atomically reserves an estimated cost before a provider call;
  `settleReservation` reconciles it against actual reported usage afterward, settling
  conservatively at the full reservation when a provider call fails to report usage rather than
  assuming zero cost; `settleExpiredReservations` (run on first use) closes out any reservation
  still `open` past its `expires_at`, covering a mid-call crash. `MissionExecutionLimits` gains
  `maxDailyEstimatedCostUsd`; new `src/access/mission-usage-guard.ts` (`checkUsageBudget`, pure)
  and `src/access/provider-concurrency-guard.ts` (`ProviderConcurrencyGuard`, in-memory named
  pools — concurrency is process-local and doesn't need durability, unlike money) back the actual
  enforcement. `AgentLoopConfig` gains an optional `usageGovernor` hook, checked at the
  provider-turn boundary (once per loop iteration): `runAgentLoop` now reserves before every
  provider call and settles after, returning a new `'budget_exceeded'` status when a governor
  denies. `symbolwright-chat-server.ts`'s `/api/agent` now builds a real governor from the
  governance store whenever the calling grant has `maxDailyEstimatedCostUsd` configured (rejecting
  outright, for a budget-limited grant, a call whose model can't be priced), wraps both the
  non-streaming and SSE paths in the new concurrency guard's `provider`/`sse` pools (`429` once a
  pool is at capacity), and now actually calls the new `MissionService.recordUsage` with
  `result.totalUsage` — fixing the drop-on-the-floor bug. `SymbolWrightMission` gains a `usage`
  field (`totalPromptUnits`/`totalCompletionUnits`, deliberately not named with "tokens" —
  `mission-redaction.ts`'s secret-key scanner matches any key containing that substring and would
  silently blank the field to `'[REDACTED]'` on every disk write, a real bug this naming works
  around rather than one this PR touches the scanner to fix). `PersistentMissionExecutor` gains an
  `isBudgetExceeded` predicate option (same cadence as the existing `maxDurationMinutes` check),
  reusing PR 2's `cancellationReason: 'budget'` vocabulary when it fires — the mechanism is built
  and tested at the executor level; wiring a live grant-budget predicate into the autonomy
  composition root (`autonomous-mission-runtime.ts`/`mission-routes.ts`) is a disclosed follow-up,
  not done in this PR. Also disclosed as deliberately out of scope: migrating
  `TeamBudget`/`TeamBudgetUsage` (`src/orchestration/orchestration-types.ts`) from float USD to
  the new integer-microdollar representation — that subsystem's floats are self-contained and
  internally consistent, and nothing compares them against the new governance store's `bigint`
  ledger today, so the migration is left as a separately-sized follow-up rather than widening this
  PR's blast radius into Bundle #11's already-tested orchestration budget code for no enforcement
  gain in this PR's actual money path.

### Added

- **Multi-Agent Engineering Orchestration (Large PR Bundle #11)**: a governed collaborative
  runtime so multiple independently authorized agents — internal or external, human or model —
  can investigate, propose competing implementations, peer-review each other's work, and converge
  on one validated pull request under SymbolWright's existing permission, mutation-safety, and
  audit boundaries. New `src/orchestration/` subsystem, built on Bundle #10's delegated-access
  grants (never a parallel authorization system): `AgentTeam`/`AgentTeamMember` formation with a
  real, independently revocable `AgentAccessGrant` minted per member; eleven built-in roles and
  five trust tiers; a purpose-built collaborative task graph with dependency readiness and a
  fail-closed (never silently substituting) assignment engine; real isolated `git worktree`
  workspaces; provenance-tracked shared context whose trust status must be explicitly promoted
  before an agent's claim can influence downstream planning; immutable, base-SHA-pinned change
  candidates; peer review that flatly refuses self-approval; an eleven-category conflict detector
  (textual overlap, protected-path, permission-scope, branch-base-drift, and more); and the one
  authoritative `TeamIntegrationService` that applies approved candidates in dependency order,
  runs real validation, and rolls back via `git reset --hard` on any failure. New versioned REST
  surface `/api/v1/agent-teams/*` and `/api/v1/agent-roles`, wired into the same production HTTP
  dispatcher every other route uses and re-authorized on every call. New "Agent Teams" dashboard
  view, wired to the live API. MCP tool exposure and live multi-vendor provider adapters are
  explicitly out of scope for this bundle — see
  `docs/autonomy/MULTI_AGENT_ENGINEERING_ORCHESTRATION.md` Section 12 for the full delivered-vs-
  deferred accounting.

- **Rebrand regression fix — "CodeMind Chat"**: repository-wide forensic search confirmed no
  active production code path still renders "CodeMind Chat" (the live chat view has read
  "SymbolWright Chat" since the earlier rebrand phases); added a regression test
  (`src/app/server/unified-server.spec.ts`) asserting the real `GET /` route's rendered output
  contains `SymbolWright Chat` and never `CodeMind Chat`, so this cannot silently regress.

- **GitHub App installation-token delegation**: Layer C of Delegated Agent Access now supports
  real GitHub App authentication instead of only the `GITHUB_TOKEN` PAT. New
  `src/github/github-app-auth.ts` signs a GitHub App JWT (RS256, dependency-free via
  `node:crypto`) from `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`/`GITHUB_APP_PRIVATE_KEY_PATH`;
  `src/github/github-app-token-provider.ts` resolves the installation covering a specific
  `owner/repo` and mints a short-lived, cached installation access token;
  `src/github/github-token-resolver.ts` is the single resolver every write path calls —
  preferring the App when configured and falling back to the PAT only when no App is configured
  at all (never silently, when an App is configured but lacks an installation for the requested
  repository — that fails closed with `GitHubAppInstallationNotFoundError`, enforcing GitHub's own
  installation scope in addition to the SymbolWright grant scope). Wired into the two production
  write chokepoints for delegated-agent flows: `POST /api/repository/pull-request` and
  `POST /api/missions/:id/github-pr-packet/publish`. CLI/local-operator GitHub paths are
  unaffected and continue using the PAT. See `docs/security/DELEGATED_AGENT_ACCESS.md` Section 6
  for setup.

- **Delegated Agent Access (Large PR Bundle #10)**: a secure, auditable, revocable
  capability-grant system so an operator can authorize an external LLM, coding agent, MCP
  client, or automation to use SymbolWright directly — without sharing `SYMBOLWRIGHT_API_KEY`
  or a GitHub credential. New `src/access/` subsystem: a ~50-capability taxonomy with fixed
  risk levels (`access-capability-catalog.ts`), five built-in permission profiles — Repository
  Analyst, Coding Agent (recommended default), Maintainer Agent, Temporary Administrator
  (step-up-gated, 1-hour max), Custom (`access-profiles.ts`) — repository/branch-pattern scoping
  (`access-branch-match.ts`), a single `AuthorizationService` evaluator every enforcement point
  shares (`authorization-service.ts`), scoped `sw_agent_...` bearer credentials hashed at rest
  with `scrypt` (`access-credential.ts`), an OAuth-style device-authorization flow for terminal
  agents and CI workers (`device-authorization-service.ts`), and an append-only audit log
  (`.symbolwright/access/audit.jsonl`). Enforced at every real production entry point, not just
  new routes: the HTTP request dispatcher (`symbolwright-chat-server.ts`, fail-closed route
  allowlist for agent-token principals), the real LLM tool-execution loop
  (`runAuthorizedTool()` in `src/runtime/tools/authorized-tool-execution.ts`, shared by
  `agent-loop.ts`'s `executeToolCall` and MCP's `call()`), and MCP tool discovery
  (`SYMBOLWRIGHT_AGENT_TOKEN` scopes `tools/list`/`tools/call` to the grant's exact
  capabilities). New versioned REST surface: `/api/v1/access-grants*` (create/list/get/pause/
  resume/revoke/rotate/delete), `/api/v1/device-authorization*` + `/api/v1/oauth/token`,
  `/api/v1/permissions/{catalog,profiles}`, `/api/v1/audit/agent-access`. New "Agent Access"
  Settings-UI section (`src/app/views/agent-access-view.ts`): create-grant form, pending
  device-authorization approvals, grant list with pause/resume/revoke/rotate/inspect, and a
  one-time credential-reveal box. The legacy `SYMBOLWRIGHT_API_KEY` local-operator path is
  fully preserved — every existing test and workflow using it is unaffected; it is never
  silently treated as unrestricted agent authorization. Full model, threat model, capability
  reference, and operator examples: `docs/security/DELEGATED_AGENT_ACCESS.md`.

### Changed

- **Trust boundary hardening for autonomous execution (Large PR Bundle #9)**:
  Bundle #8 made external, untrusted repository content a first-class input
  to the same write path and LLM-context pipeline used for the operator's
  own trusted code; this bundle hardens that pipeline for the new trust
  model.
  - **Atomic, symlink-safe writes everywhere a file is mutated**: new
    `atomicWriteFile()` helper (`src/runtime/fs/atomic-write.ts`, temp file
    in the same directory + `rename`) is now used by the `edit_file` tool,
    checkpoint restore, and `PUT /api/repository/file` — a crash between
    the write and the rename leaves the original file untouched instead of
    truncated. `isPathInsideWorkspace`/`resolveWorkspacePath`
    (`src/runtime/policy/runtime-policy.ts`) are now symlink-aware
    (`lstat`/`realpath`-based, not just lexical), and the Docker sandbox's
    own in-container file-writer script got the equivalent hardening. Also
    fixed a real, unrelated bug found while touching this list: the legacy
    entry in `DEFAULT_RUNTIME_PROTECTED_PATHS`/`DEFAULT_RUNTIME_NOISY_DIRS`
    was a duplicated `'.symbolwright'` instead of `'.codemind'` (a leftover
    from the rebrand's bulk find-replace), meaning the actual legacy state
    directory was never protected.
  - **`/api/workspace/run`, `/api/workspace/intelligence`, and
    `/api/workspace/languages` now require the same Bearer
    `SYMBOLWRIGHT_API_KEY` auth as every other `/api/*` route.**
    Previously these were reachable with no authentication at all — `/run`
    executes arbitrary JavaScript server-side via `vm`. **This is an
    intentional, documented breaking change** for any caller that relied on
    the old unauthenticated access; the browser Workspace tab already sends
    its stored key on every other call and needed no changes.
  - **Untrusted-content boundary for external-repository-intake missions**:
    `read_file`/`grep`/`search_files`/`list_files`/`glob` output is now
    wrapped in an explicit `<symbolwright:untrusted-repository-content>`
    delimiter before it reaches the LLM, with a matching system-prompt
    notice, whenever the active mission originated from external GitHub
    repository intake (`src/runtime/context/untrusted-content-boundary.ts`).
    A structural boundary, not a detector — it does not classify whether
    content is actually an attack, only marks it as data.
  - **One protected-path policy**: `src/permissions/symbolwright-permission-policy.ts`'s
    previously separately-maintained, narrower protected-path list is now
    provably derived from `DEFAULT_RUNTIME_PROTECTED_PATHS`, closing a gap
    where it silently omitted `.git`, `.symbolwright`/`.codemind`,
    `node_modules`, `dist`, and `coverage` entirely.
  - **Hygiene**: removed a stray 9-byte `pr-12-starter-lexicon-phrasebank.patch`
    (content was the literal text `Not Found`); removed the fully-dead
    `renderMissionDashboardHtml`/`mission-dashboard-html.ts` (zero
    production callers, superseded by the Missions view) and the dead
    `renderChatUiHtml()` standalone-page wrapper (shadowed by the unified
    server's route table; its still-live sibling functions
    `renderChatBodyMarkup`/`renderChatScripts`/`renderChatStyles`, used by
    the real Agent view, were kept); corrected `settings-view.ts`'s stale
    copy describing the Repository tab as "planned for Large PR Bundle 2"
    when it has since shipped; synced `docs/ARCHITECTURE.md`'s subsystem
    table with the `src/app`, `src/server`, `src/mission`, `src/autonomy`,
    `src/sandbox`, `src/github`, `src/mcp`, and `src/kernel` subsystems it
    had omitted across ~8 prior bundles of growth; removed the Node 20 leg
    from `node-compatibility.yml`'s matrix, since it tested a runtime below
    `package.json`'s declared `engines: >=22.5.0` floor.

- **AELIB connector rebrand (Phase 7)**: the outbound health-check header
  sent to the external AELIB-X1YA0I integration is now
  `x-symbolwright-connector` (was `x-codemind-connector`) — verified safe
  to rename outright since AELIB-X1YA0I's receiving endpoint never reads
  that header. Added canonical `SYMBOLWRIGHT_AELIB_ENDPOINT`/
  `SYMBOLWRIGHT_AELIB_HEALTH_PATH`/`SYMBOLWRIGHT_AELIB_TOKEN` env vars,
  falling back to `CODEMIND_AELIB_*` and then the original bare `AELIB_*`
  form. See `docs/rebrand/SYMBOLWRIGHT_MIGRATION_GUIDE.md`.

## [0.2.0] - 2026-07-25

### Changed

- **Product rebrand: CodeMind → SymbolWright.** The published npm package is
  now `symbolwright` and its canonical CLI binaries are `symbolwright`/
  `symbolwright-workspace`; the previous `codemind`/`codemind-workspace`
  binaries and the `codemind` package name keep working as compatibility
  aliases pointing at the exact same entry points. The MCP server/client
  handshake identity (`serverInfo.name`/`clientInfo.name`) is now
  `symbolwright`. The canonical environment-variable prefix is now
  `SYMBOLWRIGHT_*` (e.g. `SYMBOLWRIGHT_API_KEY`); every existing
  `CODEMIND_*` variable is still read as a fallback, with a one-line
  warning (never including the secret value) if both are set to
  conflicting values. Local persisted state moves from `.codemind/` to
  `.symbolwright/`, migrated automatically and non-destructively on first
  run (the original directory is renamed aside, never deleted). Browser-
  stored settings (API key, mode, active mission) are forward-migrated
  from their old `codemind_*` localStorage keys the same way. See
  `docs/rebrand/SYMBOLWRIGHT_MIGRATION_GUIDE.md` for the full migration
  guide and `docs/rebrand/CODEMIND_TO_SYMBOLWRIGHT_FINAL_FORENSIC_AUDIT.md`
  for the complete forensic record of this rename.

### Added

- **Bundle #8: external repository acquisition and GitHub operations**: CodeMind can now accept a GitHub repository reference, validate it, acquire it into an isolated workspace, detect its ecosystem using Bundle #7 portability, run the existing autonomous mission runtime against it unmodified, and prepare validation-backed PR evidence — with every remote GitHub mutation blocked by default until an operator explicitly allows it. New modules under `src/github/`: `github-repository-target.ts` (parses/validates `https://github.com/owner/repo`, `.git`-suffixed, SSH, `/tree/`, `/pull/`, `/issues/`, `/blob/`, and `owner/repo` shorthand forms; rejects traversal, embedded credentials, unsupported protocols, shell metacharacters, and non-allowlisted hosts), `github-operations-policy.ts` (an 11-operation taxonomy where only local workspace-scoped operations — read metadata, clone, local branch/commit — are allowed by default; every remote mutation requires explicit opt-in), `repository-acquisition.ts` (real `git clone`/duplicate into a controlled `.codemind/external-repos/` directory only, with dry-run/read-only/writable modes, safe ref validation, and honest failure detection — including a broken-remote-HEAD edge case that would otherwise misreport a real clone failure as an empty repository), `repository-intake-profile.ts` (wires acquisition + Bundle #7 portability into one structured profile with risk flags), `github-operations-adapter.ts` (real GitHub reads/writes returning typed `ok`/`blocked`/`unavailable`/`error` outcomes, reusing the existing `GitHubPrCreationClient` for writes), `pr-operation-packet.ts` (local branch/commit/PR-title/body generation with validation-output redaction, working even when all remote writes are blocked), and `external-repository-intake.ts` (the mission-runtime integration point — creates a real mission rooted at the acquired workspace via the unmodified `MissionService`/autonomy runtime, requiring no changes to Bundle #6/#7's runtime code). New API routes `POST /api/github/intake`, `POST /api/missions/:id/github-pr-packet`, and `POST /api/missions/:id/github-pr-packet/publish`; new "External Repository Intake" and "GitHub PR Packet" controls in the Missions and AI Mission Control views, with "Open Pull Request" disabled (not hidden) until policy and adapter both allow it. CI fixtures simulate external GitHub repositories with real local `git init --bare` origins (Node, Python, mixed monorepo, and unsupported-toolchain/Zig fixtures) rather than depending on live GitHub. See `docs/bundle-8-external-repository-github-operations.md`.
- **`npm run codespaces:start`**: One command that takes a fresh Codespace (or any container) to a fully usable CodeMind browser app, mobile-friendly (no `Ctrl+C` required). `scripts/codespaces-start.mjs` stops any previously tracked server via `scripts/codespaces-stop.mjs` (verified by a `CODEMIND_CODESPACES_MARKER` read back from `/proc/<pid>/environ`, so it never signals an unrelated process or a PID reused after reboot), refuses to touch port `8787` if something it didn't start is already listening there, runs `npm ci` only when `node_modules`/`package-lock.json` actually need it, always rebuilds, generates and persists a local `CODEMIND_API_KEY` under `.codemind/runtime/` (chmod `600`, gitignored) when one isn't already set, defaults `CODEMIND_RUNTIME_MODE` to `APPROVED_EXECUTION` for this path while preserving any explicitly-set env var, launches the server detached with output logged to `.codemind/runtime/codespaces-server.log`, and polls the real `/api/health` before declaring success — printing the last log lines and exiting non-zero on timeout instead of reporting a false success. Critically, it then fetches the actual served `/` HTML and syntax-checks every executable inline `<script>` block with the real V8 parser (`src/devtools/served-client-validator.ts`, `node:vm`), stopping the server and failing loudly if any script doesn't parse — the class of bug where `tsc` compiles cleanly but the emitted browser JavaScript is broken (an unescaped newline landing inside a JS string literal once a template literal nests one level too deep) is now caught at startup, not discovered by a user staring at a blank tab. Detects the real forwarded Codespaces URL from `CODESPACE_NAME`/`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` (falling back to `http://127.0.0.1:8787`, never a placeholder) and prints a single summary: health, port, runtime mode, detected provider (never its key), the real URL, the access key, and the validation results. `npm run codespaces:stop` and `npm run codespaces:status` (PID, health, branch/commit, detected provider, log location, live served-script validation) round out mobile-friendly lifecycle management without a foreground terminal. `npm run validate:served-client` (`scripts/validate-served-client.mjs`) exposes the same served-HTML validation standalone (spins up its own ephemeral server, or points at `--url`) for CI and local use. Fixed the two known instances of the underlying escaping bug at the source (`src/app/views/agent-view.ts`'s mission-transcript join, `src/app/views/repository-view.ts`'s sandbox diagnostics join) rather than leaving the architecture dependent on the post-build string-replacement patch (`scripts/patch-generated-client-newlines.mjs`) an earlier fix had introduced — that patch script is removed. README gained a short "Codespaces Quick Start" section ahead of the full step-by-step path in `docs/codespaces.md`. See `docs/codespaces.md`.
- **Agent forensic process documentation**: Added `docs/autonomy/AGENT_FORENSIC_PROCESS_DOCUMENTATION.md`, an operational manual documenting the exact intake-to-PR workflow an engineering agent follows in this repository — repository intake checklist, bug-fix and Large PR Bundle workflows, the bounded autonomous repair loop, Git/PR conventions, CI-failure handling, decision tables, two worked examples, and a machine-reproducible state machine and pseudocode spec — requested as a documentation-only deliverable so another autonomous agent can use it as an implementation blueprint. See `docs/autonomy/AGENT_FORENSIC_PROCESS_DOCUMENTATION.md`.
- **AJNA-8 / AJNA-9: architecture drift and security-sensitive path detectors**: Ajna's finding schema and merge-readiness engine already had `ARCHITECTURE_DRIFT`/`SECURITY_SENSITIVE_CHANGE` categories and `BLOCKED_BY_ARCHITECTURE_DRIFT`/`BLOCKED_BY_SECURITY` statuses, but nothing produced findings in those categories from a real diff. `detectAjnaSecuritySensitivePaths` (`src/ajna/ajna-security-sensitive-paths.ts`) classifies changed paths into `secrets-and-crypto`/`auth-and-access-control` (CRITICAL/HIGH, blocking) and `supply-chain` (MEDIUM, informational) tiers by path pattern alone. `detectAjnaArchitectureDrift` (`src/ajna/ajna-architecture-drift.ts`) flags diff-derived import edges that cross a caller-declared layering boundary (blocking) and change breadth across an unusual number of top-level `src/` modules (informational, no policy required). Both now run automatically inside `normalizeGithubPullRequestForAjnaReview`, so every normalized live PR review gets these findings for free instead of requiring hand-supplied evidence. See `docs/ajna/AJNA8_AJNA9_ARCHITECTURE_SECURITY_DETECTORS.md`.
- **Post-Bundle #7 forensic audit**: Verified Bundle #7's discovery, portable Docker validation, and web research are genuinely wired into the live server autonomy path (`src/app/api/mission-routes.ts` → `createServerAutonomyRuntime` → `DockerPortableValidationRunner`), not only exercised by tests. Found and fixed a real observability gap: every autonomous-mission event (`autonomy.*` — plan, execution, validation, repair, release, and Bundle #7's portability events) was invisible in the Missions view Timeline under every filter except "All", because `eventMatchesFilter` had no bucket for the `autonomy.` prefix. Added an `autonomy` filter bucket and de-duplicated the Missions view's hard-coded copy of the filter list (it now imports the canonical `MISSION_EVENT_FILTERS`/`MISSION_EVENT_FILTER_LABELS`, so the two lists cannot drift apart again). Also bounded `findResearchMarkers`'s repository walk with the same `maxFiles` cap its sibling inventory walk already had. See `docs/autonomy/POST_BUNDLE7_FORENSIC_AUDIT.md`.
- **Real Repository workspace (Large PR Bundle 2)**: A new **Repository** tab in the unified app shell browses and edits the actual checked-out git working tree, distinct from the Workspace tab's browser-localStorage-only "Scratch Workspace". New authenticated routes: `GET /api/repository/tree` (one directory level at a time), `GET`/`PUT /api/repository/file` (real file read/write through the same checkpoint-bound guarded path `edit_file` uses, with optimistic-concurrency conflict detection via a `contentHash`/`baseContentHash` round trip -- a 409 returns the current on-disk content instead of silently overwriting an external change), `GET /api/repository/status` and `/diff` (structured `git status --porcelain=v1` parsing and raw unified diffs -- no existing utility parsed git status into structured data before this), `GET`/`POST /api/repository/branches` (create/switch, blocked on protected refs), `POST /api/repository/commit`, `POST /api/repository/checkpoints/:id/restore` (the Checkpoints tab's restore button is no longer CLI-only now that there's a real repository to restore into), `POST /api/repository/push` (explicit `confirm: true` required; blocked on protected branches, and no force-push option is exposed to the client at all), and `POST /api/repository/pull-request` (a real draft PR via the GitHub REST API -- branch, commit, and PR creation entirely over the API, no local push/credentials needed -- reusing the same `executeGitHubPrCreation`/`DefaultGitHubPrCreationClient` the `github_create_pr` runtime tool already used for LLM-driven PR creation; returns a clear "set GITHUB_TOKEN" error rather than a fake success when no token is configured). `.codemind/` checkpoint state is always excluded from "commit everything" and from PR file auto-derivation, regardless of the target repo's own `.gitignore`. See `docs/repository-workspace.md`.
- **Unified application shell (`codemind serve`)**: The Dashboard, Universal Polyglot Workspace, chat/Agent panel, and provider config are now one application on one port instead of two separate servers (a no-auth dashboard on `3005` and an auth-gated chat server on `8787`). `GET /` serves a single-document app shell with a persistent nav (Dashboard, Workspace, Agent, Tools, Memory, Checkpoints, Settings) switched by a hash router; `GET /workspace` 302s to `/#/workspace` for bookmark compatibility. Editing code in the Workspace tab and picking an AI task now hands the draft to the Agent tab in-page (`appState.pendingAgentDraft` + `navigateTo('agent')`) instead of building a link to a separate page the user had to click, then manually connect and send — nothing is auto-sent, the user still reviews the draft and presses Send. The legacy `?draft=...&agentMode=...` URL handoff still works for old links. New read-only, authenticated APIs surface existing backend state that had no UI before: `GET /api/tools` (the real 41-tool static registry plus the 5 dynamically-wired tools, separated rather than merged, with per-runtime-mode reachability), `GET /api/memory/recent`/`GET /api/memory/procedural` (episodic/procedural memory), and `GET /api/checkpoints`/`GET /api/checkpoints/:id` (checkpoints taken before mutating writes; restore stays CLI-only). `GET /api/status` moved behind the API key (the old dashboard's equivalent endpoint was unauthenticated, which would have been a regression once merged with the rest of the app). `src/web/server.ts` is deleted; `npm run dev`/`npm run serve` both now start the one unified server (default port `8787`); `dev:web` is gone. See `docs/codespaces.md`, `docs/API_REFERENCE.md`.
- **`POST /api/agent`**: `codemind serve` now runs the real `codemind agent` tool-execution loop over HTTP/SSE — the model can read files, search the repo, and (in more permissive modes) edit files, run shell commands, and more, iterating until done. Backed by `LLMProvider` implementations for Anthropic (native `tool_use`), the whole OpenAI-compatible family (OpenAI, Groq, OpenRouter, GitHub Models, Ollama, DeepSeek, custom — one implementation covers all of them since they share one streaming `tools`/`tool_calls` wire format), and Google Gemini (`functionDeclarations`/`functionCall`, a third distinct wire format implemented separately). Defaults to `READ_ONLY` mode (narrower than the platform-wide `APPROVED_EXECUTION` default, since this is a new HTTP surface any authenticated caller can hit), with `mode` in the request body to opt into more. Streaming responses emit one SSE frame per agent event (`iteration_start`, `text_delta`, `tool_call_start`, `tool_call_end`, `loop_end`, `result`, `done`); the `result` frame's `finalMessages` can be passed back as `priorMessages` to continue the conversation with tool-call context intact (`AgentLoopResult` grew a `finalMessages` field for this). The `/` chat page has an **Agent mode** toggle that drives this endpoint directly — tool calls render as their own transcript entries and the page keeps `finalMessages` for cross-turn continuity. See `docs/runtime/CODEMIND_CHAT_SERVER.md`.
- **Gemini and DeepSeek added to `/api/chat` streaming**: `google-gemini` now streams real token deltas via `streamGenerateContent?alt=sse` instead of falling back to one full-text chunk. **DeepSeek** is a new first-class provider (`DEEPSEEK_API_KEY`, `https://api.deepseek.com`, OpenAI-compatible wire format) alongside the existing eight.
- **README**: Added a "Getting Started" section with install/build steps and a concrete example for each of the four ways to run CodeMind (terminal, browser, MCP plugin config, direct HTTP) — the CLI/capability lists mentioned these but never showed how to actually start and use them.
- **`codemind mcp-server`**: CodeMind now runs as a real Model Context Protocol _server_ over stdio (newline-delimited JSON-RPC 2.0, negotiating `2025-11-25`/`2025-06-18`/`2024-11-05`), so any MCP-compatible LLM client (Claude Desktop, Claude Code, other agent frameworks) can add it as a plugin and call its real tools. Exposes the same statically-wired runtime tool registry `codemind agent` runs on (`assembleAgentTools()`), gated by the same runtime-mode-to-capability mapping (`bridgeToolsForProvider`) — defaults to `READ_ONLY` (a deliberately narrower default than the platform-wide `APPROVED_EXECUTION`, since this is a background process any connected client can drive), with `--mode` to opt into `PROPOSAL_ONLY` or `APPROVED_EXECUTION`. A misbehaving or unwired tool call always returns a normal `isError: true` result instead of crashing the server. See `docs/runtime/CODEMIND_MCP_SERVER.md`.
- **`codemind serve`**: A real chat HTTP server and browser UI, backed by the provider gateway. Bearer-auth (`CODEMIND_API_KEY`) gates every `/api/*` route except the public `/api/health`; `POST /api/providers/register` lets an operator point any preset provider (or the `custom` slot) at any base URL/API key/model at runtime, in memory only, without redeploying; `POST /api/chat` supports real token-level SSE streaming for the OpenAI-compatible provider family and Anthropic. Includes a same-origin browser chat page at `/`, a fixed-window rate limiter, optional direct TLS via `CODEMIND_TLS_CERT_FILE`/`CODEMIND_TLS_KEY_FILE`, and a startup warning when binding a non-loopback host without TLS. See `docs/runtime/CODEMIND_CHAT_SERVER.md`.
- **Cognitive memory tools**: `memory_recall` and `memory_store` are now live runtime tools backed by the local-first cognitive memory architecture (episodic/lexical/procedural storage, retrieval, decay, and consolidation). `codemind agent` initializes a per-session memory store, migrates any legacy `.codemind/ci-failure-ledger.json` into episodic memory on first use, and runs decay/consolidation maintenance each turn.
- **`codemind preflight [changed-file...]`**: Runs the PR preflight evidence pipeline (changed-file classification, failure-ledger matching, validation planning, sandboxed command evidence) and reports a `READY`/`NEEDS_WORK`/`BLOCKED` verdict with a push recommendation. Available as both a CLI command and a `preflight` runtime tool. Wired into CI as a fast-fail signal ahead of the full validate chain.
- Runtime tool registry grew from 33 to 36 registered tools (`memory_recall`, `memory_store`, `preflight`).

### Fixed

- `RetrievalEngine`'s episodic memory search escaped SQL `LIKE` wildcards instead of stripping `%`/`_` from queries, so content containing literal underscores (e.g. `FORMAT_CHECK_FAILURE`) is now recallable by name.
- The forensics module's unit tests (`file-classifier`, `package-manager`, `failure-ledger`, `command-evidence`) previously lived under `tests/forensics/*.test.ts`, which `vitest.config.ts`'s `src/**/*.spec.ts` include pattern never matched — these tests silently never ran in `npm test` or CI. Moved to `src/forensics/*.spec.ts` alongside every other module's tests so they now execute as part of the standard test run.
- Renamed `src/memory/savant-memory.spec.ts` to `src/memory/cognitive-memory-architecture.spec.ts`; the "Savant" name belongs to the unrelated PR preflight engine, and the collision made the memory test suite hard to discover correctly.
- Raised the Docker sandbox runner's default `--memory` limit from `512m` to `2048m`. The lower limit was never exercised against real write-needing validation commands before `codemind preflight` existed; `tsc`/`vitest` on this codebase's current size OOM under 512m.
- The sandbox runner's fixed `--user node` failed with `EACCES` on write-needing commands (`npm run build`, `npm test`) under a bind-mounted workspace whenever the host checkout wasn't owned by the container's built-in `node` user. `resolveDefaultSandboxUser()` now resolves `--user` to the host process's UID:GID instead, the standard fix for Docker bind-mount permission mismatches; `--cap-drop=ALL`, `--security-opt=no-new-privileges`, and `--network none` are unchanged. `CODEMIND_SANDBOX_USER` still overrides explicitly.
- `renderPreflightReport` now includes a truncated stdout/stderr tail for failed/blocked validation commands instead of only a status line, so preflight failures are diagnosable from CI logs.
- `codemind-activation.spec.ts`'s dynamic GitHub tool-wiring test made a real outbound network request (via `wireGitHubClients`'s live `DefaultGitHubHttpClient`) that resolved quickly with normal network access but blocked for several seconds on DNS resolution under the sandbox's `--network none`, exceeding vitest's default 5000ms test timeout. Raised this test's timeout to 15000ms — it only asserts the tool dispatched, not that the API call itself succeeded, so tolerating the slower fail-path is correct. With the memory, UID, and this timeout fix, the full suite now passes 249/249 files inside the sandbox; CI's `PR preflight` step is a hard gate again (`continue-on-error` removed).
- Matching `--user` to the host UID:GID (previous fix) broke `os.homedir()` on real CI runners: an arbitrary host UID has no corresponding `/etc/passwd` entry in the container image, so `os.homedir()` falls back to `/`, and anything writing a home-relative path (e.g. `resolveStoragePaths()`'s global sessions/audit dirs) failed with `EACCES` for non-root UIDs. Added `--env HOME=/workspace` to the sandbox's Docker invocation so `os.homedir()` resolves to the writable, bind-mounted workspace regardless of whether the UID has a passwd entry. Verified against the exact failure mode (a foreign UID owning its own checkout, matching how GitHub Actions' runner user owns its own workspace) — confirmed broken without the fix, confirmed fixed with it, full suite passes 249/249 files.
- CI's `PR preflight` step was killing its own sandboxed `npm run test` with `SIGTERM` and reporting a false `[FAILED]`: the sandbox runner's `DEFAULT_TIMEOUT_MS` (120s) was sized for an earlier, smaller suite and the test suite has since grown past 480 spec files, legitimately taking longer than that inside the dockerized sandbox. Raised the default to 300s (`src/runtime/sandbox/sandbox-runner.ts`); `CODEMIND_SANDBOX_TIMEOUT_MS` still overrides it explicitly.
- `.github/workflows/deploy.yml` pinned Node 20 for its `npm run validate` step and the shipped `Dockerfile` built on `node:20-alpine`, but `src/memory/storage/database.ts` has a hard, unconditional `import { DatabaseSync } from 'node:sqlite'` — a module that does not exist before Node 22.5. Every Deploy run had been failing at `npm run validate` for many consecutive pushes (predating this fix), and — more seriously — the container image itself would have crashed on startup had a push ever gotten far enough to publish one. Bumped the Deploy workflow's Node setup and both Dockerfile stages to Node 22, and corrected `package.json`'s `engines.node` from `>=20` (already inaccurate) to `>=22.5.0` to match the real requirement.

## [0.1.0] - 2026-06-28

### Added

- **Runtime Phases A-T**: Full governed loop from read-only planning through approved execution, PR creation, review, and merge-readiness assessment.
- **Ajna Review Cortex**: Deterministic code review layer with PR evidence schema, collector fixtures, review normalization, and merge-readiness reporting.
- **Agent Loop**: Multi-turn interactive coding agent with tool schema bridge, streaming provider support, session persistence, and cost tracking.
- **Operator Console**: Interactive workspace console with 18 commands (`/zflow`, `/workspace`, and 16 core commands), aliases, history tracking, and persistent history store.
- **Universal API Gateway Contract**: Provider-neutral public API route, external client, provider adapter, and browser workspace contracts for using CodeMind from any browser or LLM.
- **Runtime Tool Assembly**: 44 registered tools across 22 capability categories with typed tool definitions and policy-gated execution.
- **Approval Gates**: Typed approval scopes (`file:write`, `github:write`, `command:validate`, `shell:execute`, `git:write`) with ticket validation at every boundary.
- **GitHub Live Read**: Policy-gated GitHub PR, CI, and file read operations behind explicit `allowNetwork` policy gates.
- **GitHub Write Surface**: Governed draft PR creation, comment posting, and label application through approval-gated write gates with audit trails.
- **Local File Write Gate**: Approval-gated file writes with protected path enforcement, workspace containment, dry-run mode, and before/after diff capture.
- **Validation Command Gate**: Allowlisted command execution (`npm test`, `npm run typecheck`, `npm run lint`, etc.) behind approval tickets.
- **Repair Loop**: Ajna finding through patch proposal, apply, validate, reassess, and merge-readiness pipeline.
- **Runtime Workflows**: Governed tool composition with bounded step execution and transcript capture.
- **Audit Trail**: Persist and replay audit ledger entries and agent kernel trace frames with automatic secret redaction.
- **Project Memory**: Vector store with cosine similarity search, disk persistence, and RAG context builder for semantic codebase queries.
- **Workspace Manager**: Multi-repo workspace management with primary selection and cross-repo file lookups.
- **HiveMind**: Swarm agent registry and dispatch for specialized capability coordination.
- **Build Ledger**: Machine-readable build state with 20/20 phase completion tracking and docs consistency checking.
- **Doctor**: 12-point workspace health check covering Node.js version, dependencies, TypeScript config, runtime phases, safety posture, API keys, and project memory.
- **Release Readiness**: 14-gate release assessment (phases, health, version, changelog consistency, entry point, exports, CLI, Dockerfile, public API contract, bin contract, package-lock contract, universal API gateway contract, validate script, workflow proof, and build-ledger consistency).
- **CI Pipeline**: Node 20+22 matrix testing, coverage enforcement (85/80/85/85 thresholds), format checking, and publish dry-run validation.
- **75 CLI commands** covering all 20 runtime phases plus diagnostics, fixtures, and agent workflows.
- **Release Proof Contract Tests**: Public API, package bin, package-lock, workflow release proof, universal API gateway, and source-of-truth build ledger regression coverage.

### Safety Posture

- Read-only by default with plan-first execution model.
- All write operations require explicit approval tickets with typed scopes.
- Protected paths (`.git`, `.env`, `node_modules`, `dist`, `coverage`) enforced at every boundary.
- Workspace containment prevents directory traversal.
- Output redaction strips secrets before audit log persistence.
- GitHub writes limited to draft PRs, comments, and labels (no merge, no force push, no branch deletion).
- Provider credentials stay behind the CodeMind server gateway; browser clients send only CodeMind API credentials and provider ids.

### Fixed

- **Runtime Activation Tool Inventory**: `runActivatedAgent()` now passes `subsystems.tools` (including dynamic GitHub live-read tools) to the agent loop instead of `config.tools`, which omitted dynamically injected tools.
- **Workspace Package Bin**: `codemind-workspace` now renders real workspace state from `WorkspaceManager` instead of a static preview surface. Operator `/workspace` and package bin share the same workspace model.
- **Build Ledger README Parsing**: Source-of-truth consistency checks now accept README wording used by the active project state (`20/20 runtime build phases complete` and `All 20 runtime phases are complete`) instead of requiring one brittle phrase.

### Changed

- **GitHub Write Authorization**: Centralized write authorization with execution mode tracking and approval scope closure.
- **Runtime Registry**: Replaced 22 wrapper registries with canonical `createFixtureRegistry()` factory supporting 22 named presets.
- **Operator Console**: Wired dormant `WorkspaceManager` into operator workspace via `/workspace` command; added `/zflow` for ZFlow report rendering.
- **Release Gates**: Expanded release readiness beyond CHANGELOG consistency to enforce public API, package bin, package-lock, universal API gateway, validate-script, workflow release-proof, and build-ledger source-of-truth gates.
- **License**: Changed from UNLICENSED to MIT license.
- **Package Contract**: Added `exports` field for ESM resolution, npm script aliases for diagnostic commands (`doctor`, `release-readiness`, `build-ledger`), and a shared `validate` release proof script.
- **Deploy Pipeline**: Hardened deploy workflow to run the shared validate release proof gate before container publishing.
- **Publish Pipeline**: Hardened publish workflow to run the shared validate release proof gate before npm dry-run and release publishing.

### Removed

- **docs/pr-plans/**: 30 completed PR plan files superseded by merged PRs (PR-2 through PR-CM-TEST-10).
- **docs/next-arc/**: 5 superseded analysis files (ANALYSIS_REPORT, NEURAL_WIRING_PLAN, PR_BUILD_PLAN, PR_IDEATION_MATRIX, VITEST_TEST_INTELLIGENCE_PLAN).
- **docs/roadmap/**: 2 stale roadmap files (CODEMIND_PLATFORM_ROADMAP, CODEMIND_100_PERCENT_BUILD_PLAN) superseded by build ledger and release readiness gates.
