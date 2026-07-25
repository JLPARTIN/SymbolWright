# Delegated Agent Access

SymbolWright lets a repository owner or operator authorize an external LLM, coding agent, MCP
client, or automation to use SymbolWright directly against a repository — without handing out the
operator's `SYMBOLWRIGHT_API_KEY` or a GitHub personal access token. This document describes the
architecture, trust model, and operator/agent workflows for that system.

Implementation: `src/access/`. Wired into the real server request path in
`src/server/symbolwright-chat-server.ts`, tool execution in
`src/runtime/tools/authorized-tool-execution.ts`, and MCP in `src/mcp/mcp-server-tools.ts`.

## 1. Architecture

Four layers, matching four distinct questions:

| Layer | Question | Implementation |
|---|---|---|
| A — Identity | *Who* is connecting? | `Principal` (`access-types.ts`): a stable `principalId` + `PrincipalType` (`human`, `llm`, `coding-agent`, `mcp-client`, `automation`, `ci`, `service-account`) |
| B — Capability grant | *What* may that principal do? | `AgentAccessGrant` — scoped repository/branch access, an explicit capability list, an approval policy, execution/session limits, and a status (`pending`/`active`/`paused`/`expired`/`revoked`) |
| C — GitHub delegation | *How* does SymbolWright perform GitHub operations on the principal's behalf? | A real GitHub App installation token, minted server-side per repository (`src/github/github-app-token-provider.ts`), with the `GITHUB_TOKEN` PAT as a documented fallback (`src/github/github-token-resolver.ts`) — never returned to the agent; grant scope *and* GitHub's own installation scope both gate whether/how a repository can be reached |
| D — Per-operation policy | Is *this specific operation, right now* authorized? | `AuthorizationService.evaluate()`/`requireAuthorized()` (`authorization-service.ts`) — the single evaluator every enforcement point below calls |

Authentication (proving who you are) and authorization (deciding what you may do) are deliberately
separate: `AccessGrantService.authenticateAgentToken()` only resolves *which* grant a token belongs
to and confirms the grant/credential/session are live; it never itself decides whether a specific
capability is allowed. That decision always goes through `AuthorizationService`.

### Enforcement chokepoints

The same `AuthorizationService` instance is used at every point that can reach a repository or a
tool, so there is exactly one place capability logic lives:

1. **HTTP route gate** — `symbolwright-chat-server.ts`'s `handleRequest`: for an agent-token
   principal, every `/api/*` route is looked up in `route-capability-map.ts`'s allowlist. A route
   with no entry is refused (`ROUTE_NOT_PERMITTED`) — new routes are unreachable by agents until
   explicitly mapped. Mutating repository routes (`PUT /api/repository/file`,
   `POST /api/repository/{branches,commit,push}`, checkpoint restore) additionally resolve the
   currently-checked-out git branch and the `owner/repo` identity (from `git remote get-url
   origin`) and pass them into the same evaluator, so branch-scope and repository-scope denials
   apply at the HTTP layer, not only inside tool calls.
2. **Tool execution chokepoint** — `runAuthorizedTool()` (`authorized-tool-execution.ts`), called
   by both `agent-loop.ts`'s `executeToolCall` (the real LLM tool-calling loop behind `/api/agent`)
   and the MCP server's `call()` handler. Every `SymbolWrightToolName` has a
   `ToolPermissionDescriptor` in `tool-permission-catalog.ts` (capability + risk level); a tool
   with no descriptor is refused for an agent-token caller. Branch/repository context is resolved
   once per `/api/agent` turn (the branch actually checked out) and applied to every tool call in
   that turn.
3. **MCP tool discovery and call** — `mcp-server-tools.ts`: when the MCP server is started with
   `SYMBOLWRIGHT_AGENT_TOKEN` set, `tools/list` only advertises tools the grant's capabilities
   cover, and `tools/call` re-checks authorization before running — hiding a tool from the list is
   never the only defense.
4. **Grant/credential management routes** (`/api/v1/access-grants*`, `/api/v1/device-authorization/{approve,deny}`,
   `/api/v1/audit/agent-access`) require the **operator's** `SYMBOLWRIGHT_API_KEY`, never an agent
   token — an agent cannot grant itself more access.

The legacy local operator (`SYMBOLWRIGHT_API_KEY`) is unaffected: `resolveRequestPrincipal()`
checks it first and, on a match, returns full trust exactly as before this system existed. Every
existing test and workflow that authenticates with the operator key continues to work unchanged —
delegated access is additive, not a replacement for local operator use.

## 2. Capability taxonomy

`src/access/access-capability-catalog.ts` defines ~59 capabilities across six categories, each
with a fixed risk level (`read`/`low`/`write`/`high`/`critical`):

- **Repository read** (`repo.metadata.read`, `repo.content.read`, `repo.history.read`,
  `repo.branches.read`, `repo.issues.read`, `repo.pull_requests.read`, `repo.checks.read`,
  `repo.workflows.read`, `repo.security_alerts.read`, ...)
- **SymbolWright intelligence** (`symbolwright.repository.index`, `.analyze`, `.search`,
  `symbolwright.plan.create`, `symbolwright.mission.{create,read,execute,cancel}`,
  `symbolwright.validation.run`, `symbolwright.repair.run`, `symbolwright.sandbox.execute`,
  `symbolwright.checkpoint.{create,restore}`)
- **Repository mutation** (`repo.branch.create`, `repo.content.{create,update,delete}`,
  `repo.commit.{create,push}`, `repo.pull_request.{create,update,comment}`, `repo.review.respond`,
  `repo.issue.{create,update}`)
- **CI/workflow** (`repo.workflow.{dispatch,rerun}`, `repo.checks.rerun`,
  `repo.actions.{logs,artifacts}.read`)
- **Orchestration** (`orchestration.team.{read,manage}`, `orchestration.task.assign`,
  `orchestration.candidate.submit`, `orchestration.review.submit`,
  `orchestration.integration.request` — see
  `docs/autonomy/MULTI_AGENT_ENGINEERING_ORCHESTRATION.md`)
- **High-risk** (`repo.pull_request.merge`, `repo.branch.protection.update`,
  `repo.settings.update`, `repo.collaborators.manage`, `repo.webhooks.manage`,
  `repo.secrets.manage`, `repo.variables.manage`, `repo.deployments.manage`,
  `repo.environments.manage`, `repo.repository.delete`, `repo.organization.manage`)

High-risk capabilities are **never** included by a profile's capability list, `additionalGithubCapabilities`,
or a wildcard expansion. There are exactly two ways one reaches a grant:
`enableMerge: true` (for `repo.pull_request.merge` specifically — see the Maintainer Agent profile)
and `explicitHighRiskCapabilities` (for everything else), which requires `stepUpConfirmed: true` and
a non-empty `reason` (`AccessGrantService.createGrant`, `access-grant-service.ts`).

Tool-to-capability mapping lives in `tool-permission-catalog.ts` — e.g. `edit_file`/`local_file_write`
require `repo.content.update` **and** `symbolwright.mission.execute`; `read_file` requires only
`repo.content.read`; `github_create_pr` requires `repo.pull_request.create`. A tool with no entry is
refused for an agent principal (fail closed), which is enforced by a unit test that walks
`ALL_SYMBOLWRIGHT_TOOL_NAMES` (`tool-permission-catalog.spec.ts`).

## 3. Permission profiles

`src/access/access-profiles.ts`:

| Profile | Summary | Recommended default |
|---|---|---|
| **Repository Analyst** | Read/index/analyze/search + plan generation. Hard-denies every mutation capability, including `symbolwright.mission.execute`. | No |
| **Coding Agent** | Analyst capabilities + mission create/execute, sandbox validation, branch create, file edit, commit, push, PR create/update, review response, CI re-run. Hard-denies merge, settings, secrets, protected-branch mutation, repo delete. | **Yes** |
| **Maintainer Agent** | Coding Agent + workflow dispatch, issue management, and (only with `enableMerge: true`, and gated by a `before-merge` operator approval) `repo.pull_request.merge`. | No |
| **Temporary Administrator** | May receive individually selected high-risk capabilities. Requires `stepUpConfirmed` + `reason`, capped at a 1-hour default *and maximum* lifetime. | No — never the default |
| **Custom** | Operator hand-picks capabilities. High-risk capabilities still require `explicitHighRiskCapabilities` + step-up. | No |

Each profile carries a default branch scope, approval policy, and execution-limit set; all three
can be narrowed (never widened beyond the profile + explicit high-risk/merge channels) at grant
creation.

## 4. Repository and branch scope

`RepositoryScope.mode` is one of `single`, `selected`, `organization`, `installation`, or
`discovery`; `AuthorizationService.checkRepositoryScope` matches the request's `owner/repo` against
it — visibility is never inferred as permission. Because a running SymbolWright server process is
always bound to one working tree, "repository scope" for the HTTP/tool enforcement points means:
is *this process's* repository (resolved from `git remote get-url origin`) inside the grant's
allowlist.

`BranchScope` defaults (`DEFAULT_ALLOWED_BRANCH_PATTERNS`/`DEFAULT_DENIED_BRANCH_PATTERNS`,
`access-types.ts`):

```
Allowed writes:  symbolwright/agent/**  codemind/agent/**  feat/**  fix/**
Denied writes:   main  master  release/**  production/**
```

`matchesBranchPattern` (`access-branch-match.ts`) supports `*`/`**` glob segments. Denied patterns
win over allowed patterns; the default branch additionally requires `defaultBranchMutationAllowed`
(off by default) even if it happens to match an allowed pattern. Branch checks run for every
branch-sensitive capability (`repo.branch.*`, `repo.content.*`, `repo.commit.*`,
`repo.pull_request.create`, `symbolwright.checkpoint.restore`) — read capabilities are unaffected.

## 5. Approval policies

`ApprovalPolicy.rules` is an ordered list of `{ match, requirement }`, matched by exact capability
first, then the literal `'high-risk'` (any high-risk capability), then `'*'`. `ApprovalRequirement`
values: `none`, `once-per-session`, `once-per-mission`, `before-first-write`, `before-push`,
`before-pull-request`, `before-merge`, `every-high-risk-operation`, `denied`.

When a requirement other than `none`/`denied` applies, `AuthorizationService` creates a pending
`ApprovalRequest` bound to a specific operation key (`grantId + capability + repository + branch +
missionId` hash) and returns `requiresApproval: true` with an `approvalId` — the caller (HTTP 403
`approval_required`, or a tool-call error string) must wait for an operator to approve it (there is
currently no dedicated approve-request route beyond writing the approval record directly; the
Settings UI surfaces pending approvals per grant). Once approved, the **same bound operation** may
proceed exactly once — the approval is marked `consumed` and cannot be replayed for a second,
otherwise-identical operation (see `access-grant-service.spec.ts`'s replay test).

Recommended Coding Agent defaults ship as the profile default: no approval for analysis/planning/
validation/push/PR-create, `before-first-write` for `symbolwright.mission.execute`, and `denied`
for merge and every high-risk capability.

## 6. Credentials and sessions

Three ways to get a credential (Section 7 of the mission brief), all implemented:

- **Manual token** (`AccessGrantService.issueCredential`): `sw_agent_<credentialId>.<secret>`.
  Only a per-credential salted `scrypt` hash is persisted (`access-credential.ts`); the plaintext
  is returned exactly once, at creation/rotation time, and never again. Verification is
  constant-time (`crypto.timingSafeEqual`).
- **Device authorization flow** (`device-authorization-service.ts`, `POST /api/v1/device-authorization`
  → operator approves via `userCode` → agent polls `POST /api/v1/oauth/token`): built for terminal
  agents, CI workers, and remote MCP clients that can't complete a browser OAuth redirect. The
  request/poll endpoints are intentionally unauthenticated (like every real OAuth device flow) —
  security comes from a short-lived device code, human-in-the-loop approval, and single delivery of
  the resulting token (the plaintext token is held in an in-memory map only until the next poll,
  never written to disk).
- **GitHub App installation tokens (implemented, preferred)**: Layer C's preferred architecture per
  the mission brief. `src/github/github-app-auth.ts` signs a GitHub App JWT (RS256, `iss` = App ID,
  a bounded `iat`/`exp` window per GitHub's spec) from `GITHUB_APP_ID` +
  `GITHUB_APP_PRIVATE_KEY`/`GITHUB_APP_PRIVATE_KEY_PATH`. `src/github/github-app-token-provider.ts`
  uses that JWT to resolve the installation covering a specific `owner/repo`
  (`GET /repos/:owner/:repo/installation`) and mint a short-lived installation access token
  (`POST /app/installations/:id/access_tokens`), caching both the installation id and the token
  (refreshed ~2 minutes before GitHub's stated expiry). `src/github/github-token-resolver.ts` is
  the single entry point every write path calls: it prefers the App when one is configured, and
  falls back to `GITHUB_TOKEN` (PAT) only when **no App is configured at all** — if an App *is*
  configured but has no installation covering the requested repository, resolution fails closed
  (`GitHubAppInstallationNotFoundError`) rather than silently widening to the broader PAT. This
  satisfies acceptance criterion 10 ("GitHub installation scope is enforced in addition to the
  SymbolWright grant scope") for real: a grant can name a repository, but if the App isn't
  installed there, no token is ever minted for it. Wired into the two production write
  chokepoints that matter for delegated-agent flows — `PUT`-adjacent PR creation
  (`POST /api/repository/pull-request`, `repository-routes.ts`) and external-repository-intake
  publish (`POST /api/missions/:id/github-pr-packet/publish`, `github-intake-routes.ts`). The
  App JWT itself is never handed to an agent, logged, or persisted — only the resulting
  short-lived installation token is used, and only server-side, immediately before one GitHub API
  call. CLI/local-operator GitHub paths (`cli-github-write-executor.ts`,
  `symbolwright-activation.ts`'s live-read wiring) are unaffected and continue to use the
  `GITHUB_TOKEN` PAT — those are the local operator's own terminal session, not a delegated-agent
  HTTP path, so migrating them is out of scope here.

### Setting up a GitHub App for SymbolWright

1. Create a GitHub App (organization or personal account → Settings → Developer settings → GitHub
   Apps → New GitHub App). Minimum permissions for the Coding Agent profile: Repository contents
   (read/write), Pull requests (read/write), Metadata (read), Checks (read), Workflows (read) —
   add Contents/Administration write only if you intend to grant branch-protection-adjacent
   capabilities (Temporary Administrator profile). Do not grant organization-admin permissions.
2. Generate a private key (PEM) for the App.
3. Install the App on the specific repository (or repositories) you intend to grant agent access
   to — **only** those repositories; installation scope is what makes `GitHubAppInstallationNotFoundError`
   fail closed for everything else.
4. Set on the SymbolWright server process:
   - `GITHUB_APP_ID` — the App's numeric ID.
   - `GITHUB_APP_PRIVATE_KEY` — the PEM contents (real or `\n`-escaped newlines are both accepted),
     **or** `GITHUB_APP_PRIVATE_KEY_PATH` — a file path to the PEM (checked when the inline
     variable is absent).
   - Leave `GITHUB_TOKEN` unset (or keep it as an intentional fallback for repositories the App
     isn't installed on — see the fail-closed behavior above; a repository the App doesn't cover
     always fails rather than silently using the PAT).
5. Restart `symbolwright serve`. Per-repository installation coverage is only checked at the time
   a write is attempted (GitHub's API is the source of truth, not a local cache) — there is no
   startup-time validation that the App is installed everywhere a grant might target yet
   (`symbolwright doctor` does not check this; see Known Limitations).

Sessions (`AgentSession`) track `lastActiveAt`, `expiresAt` (from `sessionLimits.maxSessionDurationMinutes`),
and are created/refreshed on each successful `authenticateAgentToken` call, one implicit session per
credential. `sessionLimits.maxConcurrentSessions` is enforced across a grant's credentials
(`SessionLimitExceededError`); `sessionLimits.singleUse` revokes the credential after its first
successful authentication.

## 7. Revocation and expiry — always live, never cache-only

Pause/resume/revoke (`AccessGrantService`) take effect **immediately**:

- `pauseGrant`/`revokeGrant` revoke every session for the grant on the spot
  (`revokeAllSessions`) and, for revoke, every credential too.
- Every authenticated request re-verifies grant status (`active`/`paused`/`revoked`/`expired`) and
  expiry against the current time inside `authenticateAgentToken` and again inside
  `AuthorizationService.checkGrantStatus` — a grant is never trusted from a prior check. An expired
  grant is written back as `status: 'expired'` lazily, the first time anything touches it, so
  expiry doesn't depend on a background sweep.
- `resumeGrant` only works from `paused` — a **revoked** grant can never be resumed; the operator
  must create a new grant. This is deliberate: pause is reversible, revoke is not.

## 8. Audit

Every authorization-relevant event is appended to `.symbolwright/access/audit.jsonl`
(`AccessStore.appendAuditEvent`, atomic per-entity writes matching `MissionStore`'s
temp-file+rename pattern) — `grant.*`, `credential.*`, `session.*`, `authorization.{allowed,denied}`,
`approval.*`, `device_authorization.*`, and `high_risk_operation.attempted` (emitted alongside the
normal decision event whenever the requested capability is high-risk, regardless of outcome).
Records carry principal/grant/session/repository/branch/capability/decision/reasonCode/correlationId
— never a bearer token, GitHub token, or secret value; sanitization reuses the same secret-pattern
matching already used for mission/sandbox output redaction. `GET /api/v1/audit/agent-access?grantId=...`
(operator-only) reads it back, most recent first. No separate retention job exists yet — the log is
append-only and grows with usage; operators should rotate/archive `.symbolwright/access/audit.jsonl`
externally until a retention policy ships.

## 9. Threat model

| Threat | Mitigation |
|---|---|
| Stolen agent credential | Only a salted hash is stored; revoke/rotate immediately invalidates it; scoped to one grant, one repository set, one branch pattern |
| Compromised/malicious agent | Fail-closed tool/route allowlists; every mutation re-checked per operation, not just at session start; high-risk capabilities require explicit step-up |
| Prompt-injected repository content | Out of this bundle's scope directly, but composes with the existing untrusted-content boundary (`src/runtime/context/untrusted-content-boundary.ts`, Bundle #9) — an agent's *textual* claim of permission is never authorization evidence; only a real grant is |
| Cross-repository confused deputy | `repositoryScope` is an explicit allowlist, resolved from the real git remote, never inferred |
| Cross-agent token use | Tokens embed a credential id; `authenticateAgentToken` resolves the exact grant a token belongs to — one grant's revoke never touches another's sessions (see e2e test `rejects an agent token from a different, still-valid grant`) |
| Stale authorization after revoke | No long-lived cache: every check re-reads grant/session state |
| Approval replay | Approvals are bound to one operation key and marked `consumed` on use |
| Time-of-check/time-of-use branch switch | Branch is resolved fresh per HTTP request and once per `/api/agent` turn from the actual checked-out branch, not cached across requests |
| Operator selecting excessive permissions by accident | High-risk capabilities require a separate, explicit, step-up-gated channel; the recommended default profile (Coding Agent) hard-denies them entirely |

## 10. Migration from `SYMBOLWRIGHT_API_KEY`

`SYMBOLWRIGHT_API_KEY` remains exactly as it works today for the local human operator — starting
`symbolwright serve`, using the dashboard, and every existing test all continue unchanged. It is
**not** silently treated as unrestricted agent authorization: an external agent must go through the
grant/credential flow above and receives a `sw_agent_...` token, which the server distinguishes from
the operator key by prefix. There is no automatic migration step required; operators who want to
grant an external agent access create a grant (Settings → Agent Access, or `POST
/api/v1/access-grants`) instead of sharing the operator key.

## 11. Emergency revocation

1. Settings → Agent Access → find the grant → **Revoke** (requires a reason). Every session and
   credential for that grant stops working on the next request, everywhere.
2. Or: `POST /api/v1/access-grants/:grantId/revoke` with the operator's `SYMBOLWRIGHT_API_KEY`.
3. To find the right grant quickly, check `GET /api/v1/audit/agent-access?grantId=...` for recent
   activity, or `GET /api/v1/access-grants` for `lastUsedAt`/status.
4. There is no "revoke everything" single action yet — for a suspected `SYMBOLWRIGHT_API_KEY`
   compromise (the operator key, not an agent grant), rotate `SYMBOLWRIGHT_API_KEY` itself and
   restart the server, exactly as before this system existed.

## 12. Operator examples

**Claude Code (terminal agent, device flow)**

```
Agent: Claude Code
Profile: Coding Agent
Repository: JLPARTIN/SymbolWright
Write branches: claude/**  (custom branchScope.allowedPatterns)
Expires: 24 hours
Can push: yes · Can open PRs: yes · Can merge: no · Can access secrets: no
Approval before first write: yes (profile default) · Approval before push: no
```

```bash
# On the agent side:
curl -X POST $SYMBOLWRIGHT_URL/api/v1/device-authorization \
  -d '{"principalType":"coding-agent","displayName":"Claude Code","requestedProfileId":"coding-agent","requestedRepositoryScope":{"mode":"single","repositories":["JLPARTIN/SymbolWright"],"organizations":[]}}'
# -> { deviceCode, userCode: "AB3D-9XQZ", ... }
# Operator approves in Settings -> Agent Access using userCode "AB3D-9XQZ".
curl -X POST $SYMBOLWRIGHT_URL/api/v1/oauth/token -d '{"device_code":"<deviceCode>"}'
# -> { access_token: "sw_agent_...", token_type: "bearer", grant_id }
export SYMBOLWRIGHT_AGENT_TOKEN=sw_agent_...
symbolwright mcp-server   # now capability-scoped to the approved grant
```

**CI Repair Agent (Custom profile, manual token)**

```
Agent: SymbolWright CI Repair
Profile: Custom — repo.actions.logs.read, repo.actions.artifacts.read, repo.branch.create,
  repo.content.update, symbolwright.validation.run, symbolwright.repair.run, repo.commit.push,
  repo.pull_request.create (draft)
Merge: no · Expires: 4 hours · Maximum repair attempts: 3 (executionLimits.maxRepairAttempts)
```

**Read-Only Reviewer**

```
Agent: External Review Agent
Profile: Repository Analyst
Repositories: selected
Write files: no · Execute sandbox: no · Expires: 7 days
```

## 13. Non-goals (this bundle)

Per the mission brief's explicit exclusions: no organization-administrator automation, no
repository deletion path, no billing administration, no GitHub credential collection, no plaintext
PAT storage, no auto-granting every installed/newly-created repository, no silent merge
permission, no autonomous secrets access, no branch-protection bypass, no generic identity
platform. `repo.repository.delete` and `repo.organization.manage` are not reachable through any
profile's default capability set — only via `explicitHighRiskCapabilities` on Custom/Temporary
Administrator, which still requires step-up + reason and is denied by every profile's default
approval policy (`requirement: 'every-high-risk-operation'` with no pre-existing approval).

## 14. Known limitations

- The GitHub App migration (Section 6) covers the two production write chokepoints that matter for
  delegated-agent flows (PR creation, external-intake publish). CLI/local-operator GitHub paths
  still use the `GITHUB_TOKEN` PAT — unaffected, not a regression, but not yet migrated either.
- Branch-name-level scope checking for `POST /api/repository/branches` (creating a *new* branch)
  is capability-gated (`repo.branch.create`) but does not yet re-parse the request body to
  pattern-match the requested branch name at the HTTP layer before the branch is created — the
  post-creation `git checkout -b` still runs inside the same protected-path/git-tool policy engine
  as every other write. The tool-level path (`git`/`edit_file` via `/api/agent`) resolves the
  actual checked-out branch and enforces the pattern there.
- No dedicated `POST /api/v1/access-grants/:id/approvals/:approvalId/approve` route yet — approving
  a pending operator approval currently requires writing to the approval record directly (the
  Settings UI's pending-approvals list is read-only in this bundle); wiring a dedicated approve
  route is straightforward future work using the same `AccessStore.writeApproval` the evaluator
  already reads.
- No automated audit-log retention/rotation job.
- `symbolwright doctor` does not yet validate GitHub App configuration (private-key shape,
  App-JWT signing readiness, or which repositories are actually installed) — misconfiguration
  surfaces as a runtime `GitHubAppConfigError`/`GitHubAppInstallationNotFoundError` on first use,
  not at startup.
- The installation-id cache (`GitHubAppTokenProvider`) never expires within a process lifetime —
  if an operator uninstalls the App from a repository after SymbolWright has already cached its
  installation id, that process keeps using the stale id until restarted (the *token* itself still
  expires and re-mints normally; only the id-to-installation mapping is cached indefinitely).
  Restarting `symbolwright serve` after changing App installations is recommended.
