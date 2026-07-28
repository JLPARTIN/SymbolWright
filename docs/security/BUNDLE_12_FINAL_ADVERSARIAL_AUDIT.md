# Bundle #12 Final Adversarial Audit

## 1. Executive verdict

Bundle #12 materially closes the confirmed single-node resource-isolation, cancellation, repository-intake, governance, network-hardening, and release-integrity gaps identified before the bundle began.

This audit does **not** certify SymbolWright as a horizontally scaled control plane or self-service commercial multi-tenant SaaS. It also does not treat unavailable external credentials or infrastructure as successful evidence.

Final posture at this audit stage:

- Local single operator: **GO**.
- Open-source technical preview: **GO**.
- Controlled self-hosted delegated grants: **CONDITIONAL GO**.
- Multiple mutually untrusted grants on one process/node: **CONDITIONAL GO** based on automated isolation coverage; independent external adversarial review remains NOT RUN.
- Controlled single-node hosted beta: **CONDITIONAL GO**, restricted to an operator-controlled beta with explicit limits and supported TLS/proxy configuration.
- Public self-service hosted launch: **NO-GO** while critical external integration evidence remains BLOCKED or NOT RUN.
- Horizontally scaled/high-availability service: **NO-GO**.
- Self-service commercial multi-tenant SaaS: **NO-GO**.

## 2. Repository and SHA identity

- Repository: `JLPARTIN/SymbolWright`
- Audit date: `2026-07-28`
- `auditedCodeSha`: `b9ed7bbdad7fd9c300dcf80509d94f76c909da9c`
- `auditReportCommitSha`: intentionally not embedded in this file because doing so would be self-referential. The PR commit and final merge SHA are supplied by GitHub metadata and the post-merge attestation/tag procedure.
- Report path: `docs/security/BUNDLE_12_FINAL_ADVERSARIAL_AUDIT.md`

`auditedCodeSha` is the exact `main` revision immediately after Bundle #12 PR 6 merged. PR 7 changes only this audit record unless a failed audit check requires a production correction.

## 3. Scope and methodology

The audit used four evidence classes:

1. Direct inspection of the merged implementation contracts.
2. Regression and integration tests committed with Bundle #12 PRs.
3. Required GitHub Actions results, including TypeScript, lint, formatting, tests with coverage, build, PR preflight, CodeQL, and Dependency Review.
4. Real artifact smoke performed by PR 6 against the packed npm tarball and local/hosted Docker profiles.

Outcome vocabulary is strictly `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`.

## 4. Bundle #12 remediation inventory

| Deliverable | PR | Result |
|---|---:|---|
| Initial trust-boundary and declared-contract fixes | #301-#306 | Merged |
| Delegated resource ownership/non-enumeration | #326 | Merged |
| Execution lifecycle/cancellation/graceful shutdown | #327 | Merged |
| External repository quotas and retention | #328 | Merged |
| Fixed-point durable usage governance | #329 | Merged |
| Network and operational hardening | #330 | Merged |
| Release integrity, artifact smoke, and governance closure | #331 | Merged |
| Final adversarial audit | PR 7 | This report |

## 5. Validation environment

The final PR 6 clean head completed the repository's required GitHub Actions validation on Ubuntu 24.04 with Node.js 22.

Observed final evidence before merge included:

- `npm ci`: PASS
- `npm run audit`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run format:check`: PASS
- sandbox contract tests: PASS
- full Vitest coverage suite: PASS, 533 test files
- global branch coverage: PASS at 80.014%, threshold 80%
- `npm run build`: PASS
- PR preflight: PASS
- `npm run validate`: PASS before merge
- CodeQL: PASS
- Dependency Review: PASS
- npm packed-artifact install and executable smoke: PASS
- Docker local artifact profile: PASS
- Docker hosted TLS profile: PASS

## 6. Resource ownership audit

**Outcome: PASS (automated and inspected).**

The merged access boundary models relationships separately from operations and applies resource-instance checks across missions, mission actions, autonomy, `/api/agent`, sandbox executions, checkpoints, imports, and agent teams.

Verified invariants:

- unrelated or removed principals receive `404` for inaccessible resources;
- callers entitled to know a resource exists but lacking an operation receive `403`;
- mission list visibility is filtered before pagination and total calculation;
- team access is mission-specific rather than a union of owner grant IDs;
- legacy unowned sandbox/checkpoint state is treated fail-closed/operator-only;
- delegated memory access remains operator-only until the storage schema can enforce repository scoping.

Residual limitation: memory is not yet repository-key scoped for delegated callers. The safe behavior is denial, not cross-tenant sharing.

## 7. Multi-agent identity audit

**Outcome: PASS (automated and inspected).**

HTTP operations derive candidate submitter and reviewer identity from the authenticated active team-member record instead of trusting caller-supplied `agentId` or `reviewerId`. Nested team resources are checked against their parent team/task/candidate/workspace relationships. Removed members lose access.

## 8. Mission lifecycle and cancellation audit

**Outcome: PASS with one documented limitation.**

The execution stack uses an injected abort registry and per-mission lock. Duplicate starts are rejected, cancellation wins over stale task completion, execution persistence carries revision and cancellation reason, and graceful shutdown requests aborts before the bounded socket-drain deadline.

Documented limitation: an already in-flight provider SDK request is not forcibly interrupted; cancellation prevents subsequent work and controls persisted state once that call returns.

## 9. Repository intake and retention audit

**Outcome: PASS (automated and inspected).**

Evidence covers object/workspace/file/time/free-space caps, `GIT_LFS_SKIP_SMUDGE=1`, no automatic submodule initialization, cleanup on failure, symlink-safe deletion, acquisition-root locking, two-phase quarantine, reference recheck, and retention of workspaces referenced by any retained mission state.

## 10. Usage-governance audit

**Outcome: PASS for single-process durable enforcement.**

The authoritative governance path uses SQLite transactions for reservations, usage totals, rate windows, and daily grant totals. Provider calls reserve before execution and settle afterward. Missing usage settles conservatively. Unknown pricing is not silently accepted for hard budget enforcement. Autonomous missions consult durable daily usage and persist `cancellationReason: "budget"`.

This store is local SQLite and therefore not a distributed budget ledger.

## 11. Fixed-point money and JSON-boundary audit

**Outcome: PASS.**

Hard enforcement uses `bigint` microdollars. JSON/HTTP persistence uses centralized canonical base-10 string codecs; direct `JSON.stringify(bigint)` is avoided. SQLite range validation is enforced. Orchestration budget fields were migrated from floating USD enforcement to the same canonical microdollar representation.

## 12. Network and trusted-proxy audit

**Outcome: PASS for configured single-node deployments.**

Verified contracts include:

- explicit `local|hosted` deployment mode;
- hosted refusal without direct TLS or verified trusted-proxy HTTPS;
- development plaintext escape hatch forbidden in hosted mode;
- immediate-peer CIDR verification;
- right-to-left client-IP selection;
- IPv4-mapped IPv6 normalization;
- immediate-proxy-owned forwarded protocol selection;
- rejection of malformed protocol values and disagreement between `Forwarded` and `X-Forwarded-Proto`;
- rejection of spoofed loopback-like hostnames and malformed numeric/CIDR settings.

## 13. Readiness, metrics, and shutdown audit

**Outcome: PASS.**

Public `/readyz` is coarse. Detailed readiness and metrics require operator authorization. Mission-store corruption keeps readiness at 503; hosted governance-store corruption blocks startup. Boot reconciliation is non-mutating on pristine workspaces. Client disconnects release metrics/concurrency resources. SIGTERM smoke completed cleanly.

## 14. npm artifact audit

**Outcome: PASS.**

The real `npm pack` tarball was installed into a fresh temporary project. Canonical and retained compatibility binaries were executed using their actual CLI contracts. Empty or malformed pack output now fails closed rather than producing a false PASS.

Actual `npm publish` to the public registry was not performed during this audit.

## 15. Docker local-profile audit

**Outcome: PASS.**

The built container started in local deployment mode, ran as non-root, used a writable named state volume, passed health/readiness/authenticated metrics checks, and stopped cleanly on SIGTERM.

## 16. Docker hosted-profile audit

**Outcome: PASS.**

The hosted profile used an ephemeral TLS certificate, explicit concurrency and delegated-agent limits, a writable governance store, authenticated requests, readiness checks, non-root execution, and graceful SIGTERM. Temporary TLS material was not committed.

## 17. GHCR digest audit

- Workflow contract inspection: **PASS**. Deploy captures and verifies the pushed immutable digest rather than trusting only a mutable tag.
- Live GHCR push, pull-by-digest, and boot of the registry artifact at `auditedCodeSha`: **BLOCKED** because no deployment event/registry publication was executed as part of this audit session.

## 18. Dependency and supply-chain audit

**Outcome: PASS for committed controls.**

- Third-party GitHub Actions are pinned to immutable SHAs.
- Container base images are pinned by digest.
- Dependency Review is blocking.
- CodeQL is active.
- Release workflows use `npm ci`.
- npm provenance remains configured.
- No temporary builder or diagnostic workflow remains in the PR 6 final file inventory.

## 19. External integration evidence

| Integration | Outcome | Reason |
|---|---|---|
| Real provider-backed chat with billable credentials | BLOCKED | No provider credentials were supplied to this audit |
| GitHub App installation/auth flow against a live installation | BLOCKED | No live installation credentials/environment supplied |
| npm registry publication | BLOCKED | Publishing was intentionally not performed |
| GHCR push and pull by digest | BLOCKED | No deploy event/registry publication executed |
| Independent external adversarial reviewer | NOT RUN | No separate independent reviewer participated |
| Dedicated secret-leak scanner beyond CodeQL/dependency controls | NOT RUN | No dedicated secret-scanning command/evidence was supplied |
| Browser-based mobile/Codespaces UI startup | NOT RUN | Server and artifact startup were tested; interactive browser validation was not recorded |

## 20. Twenty-point outcome matrix

| # | Check | Outcome | Evidence summary |
|---:|---|---|---|
| 1 | Fresh dependency install | PASS | `npm ci` in required CI |
| 2 | Typecheck/lint/format/build | PASS | All required static/build gates green |
| 3 | Browser startup | NOT RUN | No interactive browser evidence recorded |
| 4 | Provider-backed chat | BLOCKED | Credentials unavailable |
| 5 | Direct agent edit path | PASS | Automated agent/edit integration coverage |
| 6 | Local Docker validation | PASS | Real local artifact smoke |
| 7 | Hosted Docker validation | PASS | Real hosted TLS artifact smoke |
| 8 | Delegated read-only/coding agents | PASS | Delegated access integration coverage |
| 9 | Unauthorized action denial | PASS | Resource ownership and branch/PR guards |
| 10 | Intake quota denial | PASS | Cap-specific cleanup tests |
| 11 | Session expiration/constraints | PASS | Existing access/session regression suite included in full run |
| 12 | Token/cost exhaustion denial | PASS | Reservation and autonomous budget tests |
| 13 | Branch-scope/protection denial | PASS | Requested-branch scope regression tests |
| 14 | Required-PR enforcement | PASS | Mission completion gate tests |
| 15 | Crash/restart reconciliation | PASS | Expired reservation and boot-sweep coverage |
| 16 | GitHub App live flow | BLOCKED | Live installation unavailable |
| 17 | npm packed install | PASS | Real tarball installed and bins executed |
| 18 | Container startup/shutdown | PASS | Local and hosted smoke profiles |
| 19 | Secret-leak scan | NOT RUN | No dedicated scan beyond existing security gates |
| 20 | Independent adversarial review | NOT RUN | No separate external reviewer |

## 21. Residual risks

1. Mission/execution state remains JSON-file-backed.
2. Cancellation, locks, and concurrency guards are process-local.
3. Governance is local SQLite.
4. No cross-replica coordination or distributed transaction boundary exists.
5. Delegated memory remains denied rather than repository-scoped.
6. In-flight provider SDK calls are not forcibly aborted.
7. Live provider, GitHub App, npm publication, and GHCR deployment evidence is blocked.
8. No independent third-party adversarial review or dedicated secret scan was run.

## 22. Deployment-shape verdicts

| Deployment shape | Verdict | Basis |
|---|---|---|
| Local single operator | GO | Full local test/build/artifact posture passed |
| Open-source technical preview | GO | Safe to publish source and invite controlled testing |
| Controlled self-hosted delegated grants | CONDITIONAL GO | Single-node isolation/governance tests pass; external integrations must be validated by operator |
| Multiple untrusted grants on one process/node | CONDITIONAL GO | Automated isolation passes; independent adversarial review remains NOT RUN |
| Controlled single-node hosted beta | CONDITIONAL GO | Hosted TLS/governance smoke passes; keep access controlled and limits explicit |
| Public self-service hosted beta | NO-GO | Critical external integration and independent-review evidence incomplete |
| Horizontally scaled/high-availability service | NO-GO | No distributed control plane |
| Self-service commercial multi-tenant SaaS | NO-GO | Distributed tenancy, operations, and external evidence incomplete |

## 23. Public-launch decision

**GO** to publish SymbolWright as an open-source technical preview.

**CONDITIONAL GO** for controlled single-node self-hosted or hosted-beta use where the operator owns configuration, credentials, TLS/proxy topology, limits, backups, and incident response.

**NO-GO** for public self-service commercial multi-tenant SaaS or horizontal scaling.

## 24. Required follow-up work

- Execute provider-backed chat and agent-edit smoke with real supported provider credentials.
- Validate the GitHub App flow against a real installation.
- Execute an actual tagged npm publication rehearsal in an approved test package/registry context.
- Execute GHCR push, pull-by-digest, and boot verification from the registry artifact.
- Run a dedicated secret scanner and archive its evidence.
- Commission an independent adversarial review.
- Design a distributed mission/execution/governance control plane before horizontal scaling.
- Implement repository-key-scoped delegated memory before enabling delegated memory reads.

## 25. auditedCodeSha

`b9ed7bbdad7fd9c300dcf80509d94f76c909da9c`

## 26. auditReportCommitSha

The report commit SHA is supplied by GitHub PR metadata. It is not embedded in the report body because embedding its own SHA would change the commit and invalidate the recorded value.

## 27. Attestation/tag status

**PENDING until PR 7 merges.**

After merge, create an annotated tag or equivalent release attestation that records:

- `auditedCodeSha`;
- the PR 7 merge SHA;
- audit date;
- outcome;
- report path.

No follow-up source commit should be created merely to embed the PR 7 merge SHA.

> PR 7's committed audit document records and verifies `auditedCodeSha`, the post-PR-6 code revision actually exercised. After PR 7 merges, an annotated tag or attestation binds that report to the PR-7 merge SHA without another repository commit.
