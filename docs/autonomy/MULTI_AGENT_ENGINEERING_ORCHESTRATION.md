# Multi-Agent Engineering Orchestration

**Subsystem:** `src/orchestration/` · **Depends on:** `src/access/` (Large PR Bundle #10, delegated agent access) · **Status:** core runtime shipped, REST-wired, UI-wired; MCP tool exposure and multi-vendor live provider adapters are explicitly deferred (see [§12](#12-what-this-bundle-does-not-ship)).

This document explains SymbolWright's multi-agent engineering orchestration system: how an
operator assembles a governed team of independently authorized agents that investigate, implement
competing solutions, review each other's work, and converge on one validated pull request.

---

## 1. Why this exists

A single agent working alone is one perspective on a problem. Multiple agents can cover more
ground — but only if their work is *governed*: isolated before it's trusted, reviewed by someone
other than its author, and merged through one controlled path. This subsystem is that governance
layer. It is not "run several prompts concurrently" — see [§12](#12-what-this-bundle-does-not-ship)
for what would make that claim false.

## 2. Architecture overview

```
                    ┌─────────────────────────────────────────────┐
                    │              OrchestrationRuntime            │
                    │   (one composition root — REST, MCP, and UI  │
                    │    all call through the same instance)       │
                    └───────────────┬───────────────────────────────┘
                                    │
      ┌───────────────┬────────────┼────────────┬────────────────┬────────────────┐
      ▼               ▼            ▼            ▼                ▼                ▼
 TeamService   CollaborativeTask  Assignment  AgentWorkspace  SharedContext  ChangeCandidate
 (formation,   Service (task      Engine      Service (git    Service        Service (immutable
  lifecycle,   graph, readiness)  (scoring,   worktrees,      (provenance,   diffs, base-SHA
  budgets)                        decisions)  leases)         trust states)  pinned)
      │                                                                          │
      │                                                                          ▼
      │                                                                   ReviewService
      │                                                                   (peer review,
      │                                                                   self-review refused)
      │                                                                          │
      └──────────────────────────────► IntegrationEngine ◄──────────────────────┘
                                        (conflict detection,
                                        dependency ordering,
                                        checkpoint + rollback,
                                        validation gate)
                                                │
                                                ▼
                                   Canonical repository (git)
```

Every box above lives in `src/orchestration/`. `OrchestrationRuntime`
(`orchestration-runtime.ts`) is the single composition root — the REST routes
(`src/app/api/agent-team-routes.ts`) and the Agent Teams UI
(`src/app/views/agent-teams-view.ts`) both call through the exact same instance, so there is no
parallel or divergent orchestration path (Acceptance Criterion 29 of the originating mission
brief).

## 3. Team and role model

An `AgentTeam` (`orchestration-types.ts`) belongs to one mission and moves through:

```
forming → planning → running ⇄ paused → integrating → validating → awaiting-approval → completed
                         │                                              │
                         └──────────────────► cancelled/failed ◄────────┘
```

Each `AgentTeamMember` has its own `principalId`/`grantId` — a real
`AgentAccessGrant` minted through `AccessGrantService` (Bundle #10) when the member is added
(`TeamService.addMember`). There is no parallel authentication system: a member's effective
authority is exactly its grant's capabilities, checked fresh by `AuthorizationService` on every
mutating call. Removing a member (`TeamService.removeMember`) revokes that grant immediately —
`AuthorizationService` starts rejecting the very next request (verified in
`agent-team-collaboration-e2e.spec.ts`).

Eleven built-in roles are defined in `agent-roles.ts`, each with a declared purpose,
responsibilities, default execution modes, and whether it may mutate by default:
`lead-orchestrator`, `repository-investigator`, `architecture-specialist`,
`implementation-agent`, `test-engineer`, `security-reviewer`, `reliability-specialist`,
`performance-specialist`, `adversarial-reviewer`, `integration-agent`, `validation-agent`.
Operators can define additional roles with `defineCustomAgentRole` — a custom role can only
*describe* purpose/scope/default modes; it has no field that can widen authorization or bypass
protected-path policy, since neither concept exists in that type at all.

## 4. Trust tiers

`AgentTrustTier` — `untrusted | restricted | standard | trusted | operator-controlled` — is an
input to `TaskAssignmentEngine`'s scoring and to a role's default mutation permission
(`agent-roles.ts`'s `defaultMutationAllowed`). It is *never* itself a capability grant: a
`trusted`-tier member with a read-only `repository-analyst` grant still cannot write, and an
`untrusted`-tier member cannot be elevated by trust tier alone. Trust tier is a planning/scoring
signal layered on top of the real authorization system, not a substitute for it.

## 5. Provider abstraction

`AgentProviderKind` (`orchestration-types.ts`) is provider-neutral by design:
`symbolwright-native | openai | anthropic | google | local-model | mcp-client | remote-agent |
human-participant | custom-provider`. A team member records which provider kind it represents, but
this bundle does not ship live vendor adapters that call out to OpenAI/Google/etc. — see
[§12](#12-what-this-bundle-does-not-ship). Today, a member of any provider kind participates by
calling the same authenticated REST surface (`/api/v1/agent-teams/*`) with its own grant — that
surface is the provider-neutral contract every future adapter would sit behind.

## 6. Collaborative task graph

`CollaborativeTask` (`collaborative-task-service.ts`) is a purpose-built multi-agent task type —
deliberately not a reuse of `src/autonomy/task-graph.ts`, which plans and executes *one* agent's
own mission and has no concept of role requirements, multi-agent assignment policies, or
competitive/cooperative execution. A task declares `dependencies`, `requiredRole`,
`requiredSpecializations`, `writePaths`/`readPaths` scope, an `executionMode`
(`analysis | proposal | isolated-mutation | review | integration | validation`), and an
`assignmentPolicy` (`single-agent | competitive | cooperative | review-pair | consensus`).
`refreshReadiness` promotes a task from `queued`/`blocked` to `ready` only once every dependency
has reached `integrated`/`accepted`.

## 7. Assignment engine

`TaskAssignmentEngine.assign` (`task-assignment-engine.ts`) filters team members by hard
eligibility (role match, specialization overlap, concurrency headroom, role/execution-mode fit,
mutation permission) and scores the rest on role match, specialization overlap, trust tier,
availability, and workload headroom. A `competitive` task selects up to two members; everything
else selects one. **When no member is eligible, the engine records an `unresolved` decision — it
never silently substitutes an unqualified agent.** Every decision (selected or unresolved) is
persisted (`AgentAssignmentDecision`) and audited.

## 8. Workspace isolation

`AgentWorkspaceService.createWorkspace` (`agent-workspace-service.ts`) creates a real `git
worktree` on an immutable base SHA, on its own branch, so two agents editing the same repository
concurrently cannot physically collide on disk. **Isolation is not treated as a security boundary
by itself.** Every write inside a workspace still passes through the same symlink-aware
containment (`resolveWorkspacePath`/`isPathInsideWorkspace`, Bundle #9) the rest of the runtime
uses, scoped further to the task's `allowedWritePaths`
(`AgentWorkspaceService.assertWritePathAllowed`).

## 9. Shared context and provenance

`SharedContextService` (`shared-context-service.ts`) implements the provenance model from the
mission brief: every entry records `sourceType`, `sourceId`, `createdBy`, `evidenceRefs`, and a
`trustStatus` (`authoritative | verified | accepted | unverified | rejected | superseded`). Only
`operator`/`validation`/`policy`-sourced entries may start `authoritative`; everything from
`agent`/`tool-result`/`repository` sources starts `unverified` and requires an explicit
`promote`/`reject` call with a recorded rationale before it can influence downstream planning
(`authoritativeContextForTeam`). This is the concrete mechanism that keeps a hallucinated finding —
or a prompt-injection payload smuggled into repository content — from silently becoming team
"knowledge."

## 10. Candidates, review, and consensus

`ChangeCandidateService.submitCandidate` (`change-candidate-service.ts`) turns an agent
workspace's staged diff into an immutable `ChangeCandidate` — real `git diff --numstat`/`git diff
--cached` output, pinned to the workspace's exact `baseSha`. Immutable means immutable: a
correction creates a new candidate with `correctsCandidateId` set and marks the prior one
`superseded`; nothing ever rewrites a submitted candidate's diff.

`ReviewService.submitReview` (`review-service.ts`) enforces the one rule the mission brief treats
as non-negotiable: **an author can never review its own candidate.** This is a flat refusal
(`SelfReviewNotPermittedError`), not merely "insufficient alone" — there is no ordering or
multi-review trick that lets a candidate's own author supply its only approval.
`hasIndependentApproval` requires at least one `approve` verdict from a non-author reviewer *and*
zero open `blocking` findings. Consensus never substitutes for this: three reviewers agreeing on a
broken candidate is still gated by whatever `blocking` findings exist, and integration itself
still requires the candidate to reach `approved` via `ChangeCandidateService.decide`.

## 11. Integration engine

`TeamIntegrationService` (`integration-engine.ts`) is the **one** authoritative path from agent
work to the canonical repository — nothing else in `src/orchestration/` writes to
`team.repositoryRoot` directly.

- `prepareIntegration(teamId, candidateIds)` verifies every candidate is `approved` and belongs to
  the team, orders them by their task's dependency depth, resolves the canonical `HEAD`, and runs
  `detectConflicts` (`conflict-detector.ts`) across eleven conflict categories — most notably
  `textual-overlap` (two candidates touching the same file), `protected-path-conflict` (reusing
  `DEFAULT_RUNTIME_PROTECTED_PATHS`), `permission-scope-conflict` (a candidate reaching outside its
  task's declared write scope), and `branch-base-drift` (a candidate's base SHA no longer matches
  canonical `HEAD`). A plan with any blocking conflict stays `preparing`, not `ready`.
- `executeIntegration(planId)` refuses to run unless the plan is `ready` and canonical `HEAD`
  still matches the plan's captured SHA (protecting against a concurrent push between prepare and
  execute). It applies each candidate's patch (`git apply --index`) and commits it, in dependency
  order, then runs every involved task's `validationCommands` through the real
  `RuntimeAutonomousValidationRunner` (the same hardened Docker/portable-validation runner
  `src/autonomy/` uses for autonomous missions). Any apply, commit, or validation failure triggers
  `git reset --hard` back to the pre-integration SHA — a real rollback, not a soft-fail flag.
- `rollbackIntegration(integrationId, reason)` is available as an explicit operator action after
  the fact.

## 12. What this bundle does not ship

The originating mission brief describes a system considerably larger than one bundle can honestly
deliver at production quality. In the spirit of this repository's own forensic-audit culture (see
`docs/autonomy/NEXT_LARGE_PR_BUNDLE_FORENSIC_RECOMMENDATION.md`), here is exactly what shipped and
what did not:

**Shipped, real, and tested** (see `src/orchestration/*.spec.ts`,
`src/app/api/agent-team-routes.spec.ts`): team formation with real per-member delegated grants;
role/trust model; collaborative task graph with dependency readiness; assignment engine with
fail-closed unresolved decisions; real git-worktree workspace isolation; provenance-tracked shared
context with trust-status promotion; structured collaboration messages; immutable change
candidates with real diffs; peer review with hard self-review refusal; multi-category conflict
detection; one authoritative integration engine with real dependency-ordered apply, real
validation, and real git-native rollback; team budgets (`maxTeamSize`,
`maxCandidateImplementationsPerTask`, etc.) enforced at the point of use; a full audit trail
(`OrchestrationStore.listAudit`); a versioned REST API (`/api/v1/agent-teams/*`,
`/api/v1/agent-roles`) wired into the same production HTTP dispatcher every other route uses; and
a real (non-placeholder) Agent Teams view in the unified dashboard.

**Explicitly deferred, not faked:**

- **MCP tool exposure.** SymbolWright's MCP surface (`src/mcp/`) shares one closed tool registry
  (`SymbolWrightToolName` in `src/runtime/types.ts`) with the interactive agent loop. Extending
  that registry safely — the type union, `tool-assembly.ts`'s integrity assertions, the
  schema-bridge mode-gating switch, and the capability-permission catalog all have to move
  together — was judged too large a blast-radius change to make safely in this bundle alongside
  everything else. Today, any MCP client, remote agent, or external LLM participates by calling
  the REST API directly with its own delegated grant (Section 5) — the same live services, just
  over HTTP instead of stdio JSON-RPC. Adding first-class MCP tools (`submit_change_candidate`,
  `submit_review`, `request_integration`, `inspect_team_status`) that thin-wrap the exact same
  `OrchestrationRuntime` methods is the natural next bundle.
- **Live multi-vendor provider adapters.** `AgentProviderKind` is a real, provider-neutral type,
  but this bundle does not include working OpenAI/Google/local-model API clients that autonomously
  drive a member's work. Building a fake adapter that pretends to call a live model was explicitly
  a non-goal of the originating brief; a real one is a separate, substantial piece of work.
- **Recursive delegation, cost/token accounting, and cross-provider fallback.** `TeamBudget`
  tracks `maxAgentRuns`/`maxModelTokens`/`maxEstimatedCostUsd` as fields, but nothing in this
  bundle yet drives real token/cost accounting or provider-fallback policy — those depend on the
  live provider adapters above.
- **Full Mission Control UI.** The shipped Agent Teams view (Section "UI" below) is real and
  wired to the live API — team/member/task/candidate/audit state, not mock data — but it does not
  yet include the side-by-side Candidate Comparison view or a dedicated Integration timeline view
  the mission brief describes.
- **Boot-time crash reconciliation.** Team/task/workspace/candidate state is durably persisted
  (atomic temp-file+rename, matching `MissionStore`/`AccessStore`), so nothing is lost on restart,
  and git worktrees/branches are inspectable after a crash. An automatic reconciliation *sweep* at
  server boot (surfacing abandoned workspace leases, stale `running` tasks, etc.) is not yet
  implemented — this mirrors a known, previously-documented gap in the single-agent autonomy
  runtime (`NEXT_LARGE_PR_BUNDLE_FORENSIC_RECOMMENDATION.md` G7) and should be solved once, for
  both systems, rather than twice.

None of the above is simulated or placeholder-backed in the code that does exist — every shipped
piece above is exercised by a real git repository, a real HTTP server, and real delegated-access
grants in the test suite, not constructed unit-test doubles standing in for the runtime.

## 13. Security boundaries and threat model

This subsystem assumes every participating agent can be mistaken, compromised, prompt-injected via
repository content, or attempting to exceed its scope. Concrete mitigations already in place:

| Threat | Mitigation |
|---|---|
| Forged agent identity / spoofed sender | Every write path takes the caller's *own* authenticated `principalId`/`grantId` from the request context, never a client-supplied field; `CollaborationMessageService.send` rejects an unknown or cross-team sender. |
| Confused deputy (agent acting outside its scope) | `AgentWorkspaceService.assertWritePathAllowed` + `conflict-detector.ts`'s `permission-scope-conflict` category reject writes outside a task's declared `writePaths`. |
| Self-approval | `ReviewService.submitReview` flatly refuses when `reviewerId === candidate.agentId`. |
| Stale/rebased candidate slipping into integration | `conflict-detector.ts`'s `branch-base-drift` category, plus `executeIntegration`'s own re-check of canonical `HEAD` immediately before applying. |
| Revoked agent continuing to act | `TeamService.removeMember` revokes the grant through `AccessGrantService`; `AuthorizationService.evaluate` checks grant status fresh on every call — no caching, no grace period. |
| Prompt injection via repository content or peer messages | Not solved by this bundle beyond what Bundle #9 already ships (`src/runtime/context/untrusted-content-boundary.ts`); `SharedContextService`'s trust-status promotion (Section 9) prevents an unverified claim from becoming authoritative team memory regardless of *how* it was injected. |
| Runaway agent count / unbounded work | `TeamBudget.maxTeamSize` enforced in `TeamService.addMember`; `maxCandidateImplementationsPerTask` enforced in `ChangeCandidateService.submitCandidate`. |
| Double integration / concurrent integration races | `executeIntegration` re-verifies canonical `HEAD` against the plan's captured SHA before applying anything; a drifted plan is refused, not silently retried. |

See [§12](#12-what-this-bundle-does-not-ship) for threats this bundle does not yet mitigate (e.g.
cost/token exhaustion, since live provider accounting isn't wired up).

## 14. Operator workflow (REST)

```
POST /api/v1/agent-teams                         { missionId, name, objective, repositoryRoot }
POST /api/v1/agent-teams/:id/members              { displayName, role, provider, trustTier, accessProfileId, principalType }
POST /api/v1/agent-teams/:id/start
POST /api/v1/agent-teams/:id/tasks                { title, objective, taskType, executionMode, assignmentPolicy, writePaths, validationCommands }
POST /api/v1/agent-teams/:id/tasks/:taskId/assign
POST /api/v1/agent-teams/:id/candidates/:candidateId/review   { reviewerId, verdict, rationale, findings }
POST /api/v1/agent-teams/:id/candidates/:candidateId/accept   { rationale }
POST /api/v1/agent-teams/:id/integrations         { candidateIds }
POST /api/v1/agent-teams/:id/integrations/:planId/execute
GET  /api/v1/agent-teams/:id/events
```

Every route re-authorizes on every call: the local operator (legacy `SYMBOLWRIGHT_API_KEY`) is
always permitted; an agent-token principal must hold the matching `orchestration.*` capability
(`orchestration.team.read`, `orchestration.team.manage`, `orchestration.task.assign`,
`orchestration.candidate.submit`, `orchestration.review.submit`,
`orchestration.integration.request` — see `src/access/access-capability-catalog.ts`), granted
explicitly when the member's `AgentAccessGrant` was created. There is no route that trusts a
caller merely because it participates in the same team.

## 15. Example mission

> "Fix the intermittent mission-recovery failure, add regression tests, and prepare a pull
> request. Use multiple agents where beneficial."

1. Operator creates a team (`POST /api/v1/agent-teams`) and adds a `repository-investigator`
   (read-only `repository-analyst` grant), two `implementation-agent`s (`coding-agent` grant), and
   an `adversarial-reviewer` (read-only grant, `reviewAuthority: true`).
2. Operator creates a `competitive` `implementation` task scoped to the recovery-path files.
3. `TaskAssignmentEngine.assign` selects both implementation agents.
4. Each gets its own `git worktree` on the same base SHA
   (`AgentWorkspaceService.createWorkspace`), makes its change, and submits an immutable candidate
   (`ChangeCandidateService.submitCandidate`).
5. The adversarial reviewer reviews both (never its own, since it authored neither) — approves the
   stronger candidate, rejects the weaker one with a `blocking` finding.
6. Operator (or an authorized `integration-agent`) calls `prepareIntegration` with the approved
   candidate id. No conflicts — the plan is `ready`.
7. `executeIntegration` applies the patch, commits, runs the task's validation commands for real,
   and marks the candidate `integrated`.
8. The rejected candidate's workspace is discarded; the accepted change is now the sole diff on
   the canonical branch, ready for the existing GitHub PR-packet flow (`src/github/`) to open a
   pull request.

## 16. Troubleshooting

- **`AuthorizationDeniedError: GRANT_REVOKED`** — the member was removed from the team (or the
  operator revoked its grant directly via `/api/v1/access-grants/:id/revoke`); add a new member
  rather than trying to reuse the old grant.
- **`IntegrationNotReadyError`** — the plan has an unresolved blocking conflict, or canonical
  `HEAD` drifted since `prepareIntegration` ran; call `prepareIntegration` again after resolving
  the conflict (e.g. rejecting the losing candidate) or re-basing.
- **`CandidateBudgetExceededError`** — the task already has `maxCandidateImplementationsPerTask`
  submissions; either raise the team's budget explicitly or reassign the task.
- **`SelfReviewNotPermittedError`** — assign a different member as reviewer; there is no override
  for this one.
