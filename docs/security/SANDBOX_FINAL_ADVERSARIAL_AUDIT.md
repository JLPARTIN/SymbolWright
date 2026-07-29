# Sandbox Final Adversarial Audit

**Audit date:** 2026-07-29  
**Repository:** `JLPARTIN/SymbolWright`  
**Sandbox bundle base:** `7990209993ed891efa3e5cfdd83adfd2434929dd`  
**Audited code SHA:** `78db3fb02a432943d283b792644dafaa3e8a8543`  
**Release verdict:** **PASS**

## 1. Scope and evidence rules

This report closes the seven-part sandbox program delivered through merged pull requests #334–#341. It replaces the temporary PR #7 workplan, draft markers, findings ledger, source-export workflow, patch workflows, triggers, and cleanup notes that were incorrectly merged with PR #341.

The audit distinguishes four evidence states:

- **PASS** — source and available runtime evidence support the claim.
- **FAIL** — evidence disproves the claim or a release-blocking defect remains.
- **BLOCKED** — required evidence could not be obtained.
- **NOT RUN** — the check was outside the available execution environment or bundle scope.

A PASS verdict applies to the sandbox package and its documented self-hosted technical-preview boundary. It does not claim unrestricted multi-tenant SaaS readiness.

## 2. Delivered architecture

The completed sandbox architecture provides:

- one authoritative structured-execution broker and immutable effective-policy model;
- guarded-host execution restricted to trusted local-operator break-glass use;
- a digest-pinned strong offline container backend with copy-in/copy-out isolation;
- broker-authorized Bash, validation, portability, autonomy, MCP, and related command callers;
- governed npm dependency planning, HTTPS acquisition, archive inspection, integrity verification, content-addressed caching, lifecycle-script suppression, and durable evidence;
- operator-owned HTTPS egress profiles with DNS classification, address-pinned TLS, redirect controls, quotas, cancellation, live policy revision, redacted audit evidence, and metrics;
- a production `SandboxNetworkGateway` package entrypoint that constructs the dependency service and egress broker without enabling container networking.

Strong execution containers remain offline. Dependency acquisition and egress are separate host-side broker capabilities and do not widen the container network namespace.

## 3. Confirmed-finding closure

| Finding from the PR #7 ledger | Result | Closure evidence |
| --- | --- | --- |
| Dependency acquisition and brokered egress had no production construction boundary. | **PASS** | `SandboxNetworkGateway` now constructs `DependencyAcquisitionService` and `SandboxEgressBroker`, calls `openSession()` through `requestEgress()`, and is exported from the public universal API. First-party dashboard/tool composition remains later product-integration work, not a bypass of the sandbox boundary. |
| Dependency acquisition could return success after evidence persistence failed. | **PASS** | `DependencyAcquisitionService.finalize()` converts persistence failure to `DEPENDENCY_EVIDENCE_WRITE_FAILED`; no completed session is returned without a durable evidence path. |
| Egress request authorization failures could escape request audit and metrics. | **PASS** | Request parsing, method/header/body authorization, DNS, quota, redirect, transport, cancellation, and revision failures are handled inside the session audit/metrics boundary. Initial session-policy denial remains a pre-session authorization decision and grants no network authority. |
| Egress policy and cancellation were not rechecked after DNS immediately before transport. | **PASS** | The session checks cancellation, live policy revision, and duration after DNS validation and immediately before the pinned HTTPS requester is invoked. |
| Dependency DNS work was not cancellation-aware and live policy changes were not checked during acquisition. | **PASS** | Acquisition workers check cancellation and policy revision before work, during fetch checkpoints, after fetch, before inspection, and before cache admission. |
| The JSONL audit path did not prove every ancestor was a real directory. | **PASS** | `ensureSecureStateDirectory()` walks each path component with `lstat`, creates private directories one component at a time, and rejects symbolic links and non-directory ancestors. |
| Temporary audit and self-modifying workflow machinery had to be removed before release. | **PASS** | The correction removes all `.github/pr7-*`, `.github/workflows/pr7-*`, `docs/security/PR7_*`, and `SANDBOX_PR7_AUDIT_WORKPLAN.md` files. The release-closure integrity gate now blocks recurrence. |

## 4. Adversarial boundary results

| Boundary | Result | Evidence summary |
| --- | --- | --- |
| Guarded-host containment | **PASS** | Hosted, HTTP, delegated agent-tool, and untrusted execution paths cannot select guarded-host execution. No container failure falls back to host execution. |
| Container networking | **PASS** | Real Docker integration proved outbound networking is physically blocked while the strong backend runs with network disabled. |
| Filesystem isolation | **PASS** | Canonical repositories are not mounted read-write into untrusted containers; bounded snapshots and quarantined artifacts are used instead. |
| Process and resource isolation | **PASS** | Non-root execution, read-only root, dropped capabilities, no-new-privileges, PID/IPC isolation, CPU, memory, PID, tmpfs, timeout, output, cancellation, cleanup, and orphan reaping are enforced. |
| Dependency integrity | **PASS** | Lockfile-bound immutable plans, registry restrictions, integrity verification, tarball inspection, quotas, content-addressed storage, and lifecycle-script suppression are enforced. |
| SSRF and DNS rebinding controls | **PASS** | Direct IPs, private/link-local/metadata destinations, unsafe CNAME chains, mixed forbidden DNS answers, alternate ports, plaintext HTTP, and unauthorized redirects are denied. Approved addresses are pinned into TLS while hostname certificate verification is preserved. |
| Credential boundary | **PASS** | URL credentials and credential-bearing headers are rejected; strong containers receive no provider, GitHub, proxy, Docker socket, SSH-agent, or unrelated host credentials. |
| Policy revocation | **PASS** | Global and profile kill switches and version changes revoke active dependency or egress authority at live checkpoints. |
| Evidence persistence and redaction | **PASS** | Required evidence failures fail closed. Audit records omit raw session IDs, paths, queries, bodies, credentials, cookies, and resolved addresses. |
| Delegated direct-network bypass | **PASS** | Delegated direct `web_fetch`, `web_search`, host Git, MCP host-process, and related trusted-operator paths are denied unless routed through the appropriate governed capability boundary. |

## 5. Validation evidence

The exact PR #341 merge input completed the following GitHub Actions workflows successfully:

- CI / Validate SymbolWright
- CodeQL
- Dependency Review
- PR7 Source Export, which was temporary and has now been removed

The CI job reported:

- 561 passing test files and 1 skipped file;
- 4,259 passing tests and 6 skipped tests;
- 87.69% statement coverage;
- 80.08% branch coverage;
- 92.91% function coverage;
- 88.71% line coverage;
- successful TypeScript, ESLint, Prettier, build, preflight, npm audit, package smoke, and Docker smoke gates.

The dedicated strong-container integration proved:

- physical outbound-network denial;
- output-flood termination at the configured byte limit;
- wall-time and explicit-cancellation cleanup;
- PID and tmpfs pressure containment without container escape.

The release-truth correction adds focused regression coverage for:

- missing final audit evidence;
- temporary PR audit residue;
- moving GitHub Action tags;
- unexpected `contents: write` workflow permissions;
- non-PASS audit verdicts.

The correction PR must re-run the full repository validation before merge. Until those branch checks complete, this document's source verdict is PASS and its post-correction CI evidence is pending at the pull-request level.

## 6. Release-closure enforcement

The official `npm run release-readiness` path now executes a release-closure integrity check before the existing readiness command. The gate fails when:

- the final sandbox audit is missing or unreadable;
- the audit lacks an exact 40-character code SHA;
- the audit verdict is absent or not PASS;
- PR #7 temporary markers, notes, workflows, or triggers remain;
- any workflow grants `contents: write`;
- any external GitHub Action is referenced by a moving tag instead of a 40-character commit SHA.

Because `npm run validate`, CI, deployment, publishing, and `prepublishOnly` all use the npm release-readiness path, the state that was incorrectly accepted by PR #341 can no longer pass the supported release pipeline.

## 7. Residual non-blocking product work

The following items are real but do not invalidate the sandbox security boundary delivered by this bundle:

1. SymbolWright's first-party agent, MCP, HTTP, and dashboard surfaces do not yet expose a complete user-facing dependency-acquisition or brokered-egress workflow. The production gateway is available as a package boundary, but full product composition belongs in the next Large PR Bundle.
2. Initial egress session-policy denials occur before a session exists. A later observability improvement should persist those authorization denials at the gateway or application layer.
3. Distributed tenant isolation, distributed rate limiting, customer identity, billing, and horizontally scaled service operations remain outside the self-hosted technical-preview boundary.

These limitations must remain documented and must not be represented as completed SaaS capabilities.

## 8. Final decision

The seven-part sandbox implementation is accepted for SymbolWright's documented self-hosted, single-operator, BYOK technical-preview boundary.

**Release verdict:** **PASS**

The correction PR itself must remain unmerged until its CI, CodeQL, and Dependency Review checks are green and the changed-file review confirms that no temporary audit machinery remains.
