# Sandbox Final Adversarial Audit

**Audit date:** 2026-07-31
**Repository:** `JLPARTIN/SymbolWright`
**Bundle base SHA:** `ab910fe` (tip of the prior sandbox audit, PR #341)
**Audited code SHA:** `762db17bfcf39ee0da0cb7b02c1c26e6b6d5f0fa`
**Correction-validation SHA:** `3bf0fe5b118895228ffb05d3d730e0f7abc78fa1`
**Release verdict:** **PASS**

## 1. Scope and evidence rules

This report closes Large PR Bundle #13 (merged PRs #342–#347), which took the sandbox network
gateway from a package-boundary-only construction (delivered by the prior seven-part bundle,
audited in this same document at PR #341) to a live, fully-wired, operationally hardened
capability: governed dependency acquisition, governed brokered egress, an operator control plane,
and boot-time lifecycle reconciliation.

Evidence states are unchanged from the prior audit:

- **PASS** — source and available runtime evidence support the claim.
- **FAIL** — evidence disproves the claim or a release-blocking defect remains.
- **BLOCKED** — required evidence could not be obtained.
- **NOT RUN** — the check was outside the available execution environment or bundle scope.

A PASS verdict applies to the sandbox package and its documented self-hosted, single-operator,
BYOK technical-preview boundary. It does not claim unrestricted multi-tenant SaaS readiness.

**Audited-SHA methodology.** Every finding below was independently verified by reading the actual
merged source at `762db17` — not by trusting a PR title, description, or an earlier report — and,
where a defect was found, by tracing it to the exact line before writing a fix. Two categories of
defect were found and corrected at the correction-validation SHA: one generalization gap in the
release-closure gate itself, and one residual evidence gap explicitly flagged as future work by the
prior audit (§7 below). No other correction was required; the bundle's own PRs (#345, #346, #347)
were each independently re-verified as they were built, in this same session, rather than accepted
on faith after merge.

## 2. Delivered architecture (this bundle)

Building on the prior bundle's authoritative broker and immutable policy model, PRs #342–#347
deliver:

- a production `SandboxNetworkGateway` construction boundary (#343, closing the prior bundle's
  first residual item);
- governed npm dependency acquisition reachable through the authenticated HTTP route, the
  agent-loop tool-execution chokepoint, and MCP (#344);
- governed brokered HTTPS egress reachable through the same three surfaces, with an explicit
  provider-facing tool schema and redacted (hostname-only) responses (#345);
- an operator-only, read-focused control-plane API and dashboard section reporting the same
  runtime every caller shares (#346);
- boot-time reconciliation for dependency-layer bindings and orphaned materialization staging
  directories, bounded egress-audit-log retention with a torn-line-tolerant reader, and
  process-wide aggregate concurrency caps for both capabilities (#347).

Strong execution containers remain physically offline throughout. Dependency acquisition and
egress remain separate host-side broker capabilities and never widen the container network
namespace.

## 3. Confirmed-finding closure (this bundle's own defects, found and fixed)

These are defects independently discovered in this bundle's branches *before* merge, by reading
the actual diff rather than trusting the branch's own commit messages — not defects surviving in
`main`.

| Finding | Where found | Result | Closure evidence |
| --- | --- | --- | --- |
| A committed, self-modifying GitHub Actions workflow (`contents: write`, floating Action tags, a large source-generating script triggered by a marker-file push) was present on the egress branch before merge. | PR #345, pre-merge | **PASS** | Removed before merge; `assessReleaseClosureIntegrity()` (`npm run release-readiness`) reports `PASS, Findings: none` at the audited SHA. |
| The egress HTTP route handler existed but was never dispatched — admitted by the capability map, unreachable in the real server. | PR #345, pre-merge | **PASS** | `sandbox-routes.ts` now dispatches `POST /api/sandbox/egress`; route tests cover it end to end. |
| The shared agent-loop authorization chokepoint and MCP server never built `sandboxEgressAuthorization` — the tool was registered but non-functional through either real caller path. | PR #345, pre-merge | **PASS** | `authorized-tool-execution.ts` and `mcp-server-tools.ts` mirror the existing `dependency_acquire` treatment for egress; both paths are tested. |
| The governed egress response returned `response.finalUrl` verbatim, including any redirect target's raw path and query. | PR #345, pre-merge | **PASS** | Redacted to a hostname; a dedicated redaction test asserts the raw path/query/token never appears in the rendered result. |

## 4. Findings from this audit (PR #348) itself

| Finding | Result | Closure evidence |
| --- | --- | --- |
| The release-closure gate's temporary-artifact detection was hardcoded to the `pr7-` prefix and an exact `PR7_`/`SANDBOX_PR7_AUDIT_WORKPLAN.md` match from the *previous* bundle — a future bundle's own scratch files would not have been caught. | **PASS** | `release-closure-integrity.ts` now matches any numbered-bundle prefix (`pr\d+[-_]`) and a keyword-anchored set (trigger, workplan, not-for-merge, draft-marker, findings-ledger, auto-commit, self-modifying) scoped to `.github` and `docs/security` only. A dedicated test proves a `pr42-` marker is now caught and that a legitimate doc containing an unrelated word (`SANDBOX_NETWORK_GATEWAY_COMPOSITION.md`) is not falsely flagged. |
| README's "Current Foundation Docs" list pointed at three `SYMBOLWRIGHT_`-prefixed filenames that were never actually created during the CodeMind→SymbolWright rebrand — the real files still carry their original `CODEMIND_`-prefixed names. | **PASS** | List corrected to the files that actually exist on disk; all entries now resolve. |
| `docs/API_REFERENCE.md` marked `POST /api/missions` and `GET /api/missions/:id/events` "Contract only... not yet implemented", but both are real, live handlers in `src/app/api/mission-routes.ts`, wired into the running server (confirmed by tracing the dispatcher). | **PASS** | Corrected to Live; the previously-undocumented `GET`/`PATCH`/`DELETE /api/missions/:id` and `POST /api/missions/import` rows were added for the same real route file. `POST /api/tools/run` and `GET /api/sessions/:id` were verified to have zero implementation anywhere in the codebase and remain correctly marked contract-only. |
| The prior audit's residual item #2 ("initial egress session-policy denials occur before a session exists... a later observability improvement should persist those authorization denials") was only half-closed: the *gateway-level* pre-session denial (policy rejects the destination) was already durably audited, but the *route-level* pre-policy denials (grant no longer exists, legacy-unsupported network state, no policy reference bound to this caller) recorded nothing. | **PASS** | `sandbox-egress-routes.ts` now records a `sandbox.egress.blocked` mission event for all three route-level pre-session denial branches, best-effort (never blocking or delaying the 403 response itself). A route test asserts the event is recorded for the missing-policy-reference case. |

## 5. Adversarial and structural verification carried out in this audit

- **Cross-surface parity.** Traced (not assumed) that `runBootSweep` is wired into the real server
  startup path (`operational-bootstrap.ts`), that HTTP/agent-loop/MCP/dashboard/doctor/readiness/
  control-plane all resolve the same memoized `ApplicationSandboxNetworkRuntime` per workspace
  root, and that the new `sandbox_network_reconciliation` readiness check does not collide with the
  pre-existing `sandbox_network_gateway` check.
- **Non-operator information leakage.** Confirmed the new aggregate-concurrency snapshot and
  dependency-layer-binding/egress-audit-log fields are reachable only through the already-audited
  operator-only control-plane route (404, not 403, for a non-operator caller) — no new leakage
  surface was introduced.
- **Reconciliation/retention attack surface.** Confirmed `reconcileDependencyLayers` and
  `rotateEgressAuditLogIfNeeded` are only ever invoked from boot sweep (once, at process startup,
  before the server accepts requests) — no HTTP route, tool, or MCP call can trigger either on
  demand, so there is no caller-controlled DoS or interference surface here.
- **Direct-network bypass.** Re-confirmed (unchanged from the prior bundle's own verification in
  PR #345) that `web_fetch`/`web_search` remain a trusted-local-operator-only surface that always
  refuses a delegated caller, and are no longer even advertised to one in MCP discovery, so
  `sandbox_egress_request` remains the only live network path for a delegated grant.
- **Symlink and special-file handling.** Every new filesystem-touching function added by #347
  (`listBindings`, the orphan-temp-dir sweep, the egress-audit reader/rotator) uses `lstat` (never
  follows a symlink) before treating an entry as real state; each has a dedicated test proving a
  planted symlink is refused or silently excluded rather than followed. Not re-verified again here
  beyond confirming the tests still pass at the audited SHA, since this was already adversarially
  tested when #347 was built in this same session.
- **Release-closure gate, live repository check.** `node dist/cli-release-closure.js` at the
  correction-validation SHA reports `PASS, Findings: none` against the real repository, not only
  the unit-test fixtures.

## 6. Validation evidence

At the audited SHA (`762db17`, tip of #347, before any audit-report-only commit), each of PRs
#345, #346, and #347 was independently validated in this session — full `npm run test:coverage`,
`typecheck`, `lint`, `format:check`, `build`, and `release-readiness` — before being merged, with
CI/CodeQL/Dependency Review confirmed green on GitHub for each PR's exact head.

The correction-validation SHA (`3bf0fe5`) was then validated in full:

- `npm run audit`: **PASS** (0 vulnerabilities);
- `npm run test:release-scripts`: **PASS**;
- `npm run typecheck`: **PASS**;
- `npm run lint`: **PASS**;
- `npm run format:check`: **PASS**;
- `npm run test:coverage`: **PASS** — 588 test files passed, 1 skipped; 4,484 tests passed, 6
  skipped; 87.73% statement, 80.02% branch, 92.96% function, 88.72% line coverage — thresholds
  unchanged from the audited SHA;
- `npm run build`: **PASS**;
- `node dist/cli-release-closure.js`: **PASS**, `Findings: none`;
- `npm run release-readiness --static`: **PASS**, 18/18 gates, `RELEASE_READY` (the Docker-dependent
  smoke gates are marked deferred rather than run in `--static` mode; see §7).

## 7. Residual, non-blocking limitations

1. **Strong-container Docker smoke gate could not be executed in this session's sandbox** (no
   Docker daemon available in this execution environment — confirmed by direct connection failure,
   not assumed). This is an environment limitation of the auditing session, not a defect in the
   gate or the code: on real GitHub Actions CI (which has Docker), the equivalent "Validate
   SymbolWright" job passed on the exact head of PRs #345, #346, and #347. This gate must still be
   confirmed green on the exact correction-validation head in real CI before this PR merges.
2. **No full timing-injected concurrency chaos harness.** PR #347 added real, tested coverage for
   N-way concurrent binds to the same workspace identity, orphaned-directory sweep races against an
   in-flight materialization (age-gated, not timing-gated), and process-wide concurrency-cap
   enforcement — but not a harness proving every possible interleaving under real concurrent HTTP
   load (garbage collection racing a live reader mid-read, a policy revision landing exactly
   mid-request). This was an explicit, documented non-goal of #347 and remains one here.
3. **Aggregate concurrency and boot-time reconciliation are process-local, not distributed.**
   Unchanged from the prior bundle's own documented boundary: distributed tenant isolation,
   distributed rate limiting, customer identity, billing, and horizontally scaled service operation
   remain outside the self-hosted technical-preview boundary this bundle documents.
4. **No cross-grant "list all pending approvals" endpoint and no dependency-layer-binding
   enumeration UI beyond the redacted health counts already exposed.** Neither exists anywhere in
   the codebase; each is a genuine new capability with its own authorization-surface implications,
   deliberately deferred rather than bolted on to this bundle (documented explicitly in PR #346).

These limitations must remain documented and must not be represented as completed distributed-SaaS
capabilities.

## 8. Final decision

Large PR Bundle #13 (PRs #342–#347) is accepted for SymbolWright's documented self-hosted,
single-operator, BYOK technical-preview boundary. The two defects found during this audit (the
release-closure gate's bundle-number-specific detection, and the incomplete pre-session egress
denial evidence) were corrected and validated at the correction-validation SHA above before this
verdict was recorded.

**Release verdict:** **PASS**

This PR must not merge unless its exact final head has green CI, CodeQL, and Dependency Review
checks, and changed-file review confirms no temporary audit or release machinery remains.
