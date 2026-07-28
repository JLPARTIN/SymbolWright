# Sandbox Large PR Bundle — Forensic Audit and Revised Build Plan

**Repository:** `JLPARTIN/SymbolWright`  
**Audit date:** 2026-07-28  
**Current-main baseline:** `6481828363bcf66aafded5030fa93941daabfc6b`  
**Last production-code baseline covered by Bundle #12 final audit:** `b9ed7bbdad7fd9c300dcf80509d94f76c909da9c`  
**Mission type:** Source-forensic audit and implementation planning. This document does not enable sandbox network access or change production runtime behavior.

---

## 1. Executive decision

The previously contemplated sandbox effort must be expanded and reordered.

A narrow change that turns Docker networking from `none` into a bridge or host-connected mode is **NO-GO**. It would create outbound access before SymbolWright has one authoritative sandbox policy, a strong container execution boundary, destination controls, DNS-rebinding defenses, dependency-acquisition governance, or complete evidence and quota enforcement.

The correct next sandbox bundle is:

> **Unified Strong Sandbox, Secure Dependency Acquisition, and Brokered Egress**

The implementation order is mandatory:

1. Correct the trust claims and fail closed around guarded-host execution.
2. Unify the currently divergent execution paths behind one authoritative broker and policy decision.
3. Ship a real, offline-by-default, strongly isolated container executor.
4. Migrate every production execution caller to that broker and remove policy duplication.
5. Add controlled dependency acquisition as a separate phase from runtime execution.
6. Add brokered, policy-profile-based egress only after the offline boundary is proven.
7. Run a final adversarial audit against the exact completed revision.

Until the bundle reaches the egress slice and passes its adversarial gates:

- `executionLimits.sandboxNetworkAccess: true` remains rejected;
- all strong-sandbox execution remains network-disabled;
- there is no direct Docker bridge-network opt-in;
- no API request may supply raw domains, URLs, proxy settings, image names, mounts, or container flags;
- guarded-host execution is not treated as a sandbox.

### Current-state verdict

| Surface | Verdict | Reason |
|---|---|---|
| Docker validation runners for trusted local work | **CONDITIONAL GO** | Offline by default and useful, but they do not yet satisfy SymbolWright's own future strong-container contract. |
| Universal server `guarded-host` execution | **NO-GO for hosted or delegated untrusted code** | It directly spawns host processes. Declared `network: false` and `networkPolicy: disabled` are descriptive, not enforced isolation. |
| Public self-service sandbox execution | **NO-GO** | Strong container backend, unified governance, and adversarial isolation evidence are incomplete. |
| Enabling general sandbox internet access now | **NO-GO** | Would introduce an unguarded SSRF and exfiltration boundary. |
| Proceeding with this revised Large PR Bundle | **GO** | The work is evidence-grounded, ordered by trust-boundary dependency, and produces a complete vertical capability. |

---

## 2. Audit scope and evidence standard

This audit inspected the current production paths and their direct policy, API, access-control, documentation, and test contracts. The primary targets were:

- `src/runtime/sandbox/sandbox-runner.ts`
- `src/portability/portable-validation-runner.ts`
- `src/runtime/tools/bash-tool.ts`
- `src/runtime/validation/validation-command-runner.ts`
- `src/autonomy/runtime-validation-runner.ts`
- `src/sandbox/sandbox-service.ts`
- `src/sandbox/sandbox-policy.ts`
- `src/sandbox/sandbox-guarded-host-backend.ts`
- `src/sandbox/sandbox-request.ts`
- `src/sandbox/sandbox-registry.ts`
- `src/sandbox/sandbox-container-policy.ts`
- `src/sandbox/sandbox-container-command-plan.ts`
- `src/sandbox/sandbox-images.ts`
- `src/app/api/sandbox-routes.ts`
- `src/access/route-capability-map.ts`
- `src/access/access-capability-catalog.ts`
- `src/access/access-types.ts`
- `.env.example`
- `.github/workflows/ci.yml`
- `docs/runtime/SYMBOLWRIGHT_UNIVERSAL_SANDBOX.md`
- `docs/security/BUNDLE_12_FINAL_ADVERSARIAL_AUDIT.md`
- merged PR #304, which rejects unsupported `sandboxNetworkAccess: true`

Evidence classifications used here:

- **CONFIRMED:** Directly visible in the current source or merged PR diff.
- **INFERRED:** A security or operational consequence logically follows from confirmed source behavior.
- **NOT RUN:** This audit did not execute the repository, containers, or external integrations locally. Existing Bundle #12 CI and artifact evidence is historical supporting evidence, not a substitute for the final sandbox-bundle audit.

---

## 3. Current architecture map

SymbolWright currently has three materially different server-side execution systems.

### 3.1 Runtime Docker command runner

`src/runtime/sandbox/sandbox-runner.ts` powers the `bash` tool and the legacy root validation path.

Confirmed characteristics:

- command binaries are restricted to `git`, `npm`, `npx`, `node`, and `prettier`;
- shell metacharacters are rejected and Docker is spawned with an argument array;
- Docker always receives `--network none`;
- all Linux capabilities are dropped and `no-new-privileges` is set;
- memory, CPU, timeout, and output are bounded;
- the current repository/workspace is bind-mounted read-write directly at `/workspace`;
- the configured image defaults to the mutable tag `node:22-bookworm`;
- the runner does not add `--pull=never`, a read-only root filesystem, a PID limit, a controlled tmpfs, a dedicated seccomp profile, or a temporary copy-in/copy-out workspace;
- a caller-provided `timeoutMs` can flow to the runner without being clamped to a server maximum;
- the environment supports image, memory, CPU, user, and Docker-binary overrides without one centralized policy validator.

This path is an offline Docker validation runner, but its current description as a zero-trust sandbox is stronger than the implemented boundary.

### 3.2 Portable Docker validation runner

`src/portability/portable-validation-runner.ts` powers discovered ecosystem and nested-package validation.

Confirmed characteristics:

- it independently constructs a second Docker argument list;
- it also uses `--network none`, dropped capabilities, `no-new-privileges`, memory/CPU limits, a host UID/GID, and a direct read-write repository mount;
- it selects an image from the validation command;
- it has separate timeout/output behavior and separate environment parsing;
- it does not use the future container policy plan as its authoritative decision source.

This duplication creates policy drift: a hardening change in one runner does not automatically protect the other.

### 3.3 Universal sandbox service and guarded-host backend

`src/sandbox/sandbox-service.ts` is the structured `/api/sandbox/*` and `sandbox_execute` system.

Confirmed characteristics:

- browser, container, WASM, guarded-host, and unavailable trust classes exist in the model;
- the container policy and command plan are explicitly non-executable;
- the only server-side backend currently wired by this service is `guarded-host`;
- guarded-host is disabled by default and requires `SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true` plus an approved runtime mode;
- an explicit `requestedRunnerId` can select a guarded-host runner once it is available;
- guarded-host directly spawns host language runtimes and compilers with `shell: false` in a temporary directory;
- it does not create a container, namespace, VM, WASM boundary, seccomp boundary, filesystem jail, or network namespace;
- it enforces timeout and output limits, but the declared memory, CPU, process, and artifact limits are not enforced at the operating-system boundary;
- it receives a minimal environment, but child code retains the host process's ordinary filesystem visibility and network reachability according to the operating-system account;
- its registry advertises `capabilities.network: false` and `networkPolicy: disabled`, although no network-denial mechanism exists in the guarded-host backend.

The guarded-host implementation is therefore a trusted local execution escape hatch, not a sandbox. Treating it as a sandbox produces a material truth gap.

---

## 4. Confirmed forensic findings

### F-SBX-001 — Guarded-host network and filesystem declarations are not enforced

**Severity:** High when the opt-in is enabled  
**Status:** CONFIRMED

The guarded-host runner directly invokes host executables. Its `network: false` capability and `networkPolicy: disabled` inventory fields do not create network isolation. The same process can attempt outbound connections and read files available to the SymbolWright operating-system user.

**Required response:**

- Rename and classify guarded-host as host execution rather than sandbox isolation.
- Refuse guarded-host in hosted deployment mode.
- Refuse guarded-host for delegated grants and multi-agent team members.
- Restrict any retained local operator escape hatch to an explicit break-glass posture with a prominent warning and durable audit event.
- Never use guarded-host to satisfy a strong-sandbox or network-disabled attestation.

### F-SBX-002 — `repository.rootPath` is caller-shaped in the structured sandbox request

**Severity:** High when guarded-host is enabled  
**Status:** CONFIRMED

The structured request validates that `repository.rootPath` is a non-empty string, then resolves selected files relative to that caller-selected root. Containment is checked against the supplied root, not against a server-authoritative set of managed workspaces.

**Required response:**

- Remove raw repository-root authority from external request JSON.
- Resolve workspace identity server-side from a mission, repository, or workspace ID owned by the caller.
- Canonicalize with realpath and reject symlink or mount escapes.
- Copy approved input into an execution workspace rather than granting direct arbitrary host-root selection.

### F-SBX-003 — Three execution paths implement three policy dialects

**Severity:** High  
**Status:** CONFIRMED

The runtime Docker runner, portable Docker runner, and universal sandbox service each make separate decisions about images, limits, mounts, commands, evidence, and availability.

**Required response:**

- Introduce one `SandboxExecutionBroker` and one `EffectiveSandboxPolicy` decision.
- Route every production caller through that broker.
- Keep adapters for language/command planning, but forbid adapters from constructing or weakening isolation flags independently.
- Delete duplicated Docker policy builders after migration.

### F-SBX-004 — Existing Docker runners do not meet the repository's own future strong-container contract

**Severity:** High for untrusted multi-tenant execution  
**Status:** CONFIRMED

The non-executable future plan requires controls such as a read-only root filesystem, private PID namespace, process limit, tmpfs, fixed non-root user, `--pull=never`, controlled workspace mount, and cleanup. The two executable Docker runners enforce only a subset.

**Required response:** Promote the policy plan into the sole executable container builder, strengthen it where noted below, and make runtime evidence prove the effective flags rather than merely documenting them.

### F-SBX-005 — Direct read-write repository mounts expand blast radius

**Severity:** High for untrusted code  
**Status:** CONFIRMED

Both executable Docker runners mount the live repository read-write. A command expected to validate can modify, delete, encrypt, or flood the checkout within the container user's host permissions.

**Required response:**

- Materialize a dedicated temporary execution workspace.
- Copy in only the required repository snapshot or selected files.
- Run untrusted execution against the copy.
- Copy out only explicitly approved artifacts or a bounded proposed patch after validation.
- Keep the canonical repository mutation path transactional, checkpointed, and policy-governed outside the sandbox.

A direct write mount may remain only for an explicitly classified trusted-local optimization profile, never for delegated, hosted, external-repository, or network-enabled execution.

### F-SBX-006 — Mutable image references weaken reproducibility and policy identity

**Severity:** Medium to High  
**Status:** CONFIRMED

The runtime runner and sandbox image allowlist use mutable tags. The repository's release container is digest-pinned, but the sandbox execution images are not uniformly pinned.

**Required response:**

- Resolve every production sandbox image to an operator-approved immutable digest.
- Record both friendly image ID and digest in execution evidence.
- Use `--pull=never` during normal execution.
- Add a separate operator-controlled image preparation/update workflow with signature/provenance verification where supported.

### F-SBX-007 — Declared resource limits are only partially enforced

**Severity:** High for guarded-host; Medium for current Docker runners  
**Status:** CONFIRMED

Guarded-host enforces timeout and output but not memory, CPU, process count, or artifact size at the OS boundary. The current Docker runners enforce memory and CPU but not the full shared `SandboxLimits` contract.

**Required response:** Every limit advertised in an effective policy must be either enforced and evidenced or marked unsupported and rejected. No silent no-op limits.

### F-SBX-008 — Request-level runtime mode and timeout authority are too permissive

**Severity:** Medium  
**Status:** CONFIRMED

The sandbox API parses a runtime mode from request content and defaults it to `APPROVED_EXECUTION`; central authentication and capability checks still apply, but the effective execution mode should be derived from authenticated server context, not self-asserted JSON. The `bash` tool also accepts a timeout override that reaches the Docker runner without a centralized maximum clamp.

**Required response:**

- Derive runtime mode, caller identity, deployment mode, ownership, and approval from authenticated server context.
- Treat request fields as proposals that may only narrow limits.
- Clamp all timeout and resource overrides through one policy resolver.

### F-SBX-009 — Sandbox execution is under-classified in delegated access

**Severity:** Medium to High  
**Status:** CONFIRMED

`symbolwright.sandbox.execute` is cataloged as a low-risk capability. Host execution, dependency acquisition, and network egress have materially different risk and must not share one broad permission.

**Required response:** Split capabilities:

- `symbolwright.sandbox.execute.offline` — strong offline container execution;
- `symbolwright.dependencies.acquire` — controlled dependency acquisition, high risk and explicit;
- `symbolwright.sandbox.egress` — brokered runtime egress, high/critical risk and explicit;
- retain or migrate `symbolwright.sandbox.execute` as a compatibility alias only with conservative offline semantics.

Broad wildcard grants must never implicitly gain dependency acquisition or egress.

### F-SBX-010 — Documentation and operator language overstate the boundary

**Severity:** Medium  
**Status:** CONFIRMED

The universal sandbox document says the new server backend does not execute host code, while guarded-host execution is implemented behind an opt-in. The `bash` tool describes the current runner as zero-trust. Inventory declarations can imply disabled network where the guarded-host backend cannot enforce that claim.

**Required response:** Update docs, CLI, dashboard, doctor output, API evidence, and capability names to distinguish:

- browser isolation;
- strong offline container isolation;
- brokered-egress container isolation;
- trusted local host execution;
- unavailable/unsupported execution.

### F-SBX-011 — A boolean network flag is not a sufficient egress policy

**Severity:** Architectural blocker  
**Status:** CONFIRMED/INFERRED

A boolean cannot express destination scope, protocols, ports, DNS behavior, redirects, bytes, requests, duration, credentials, dependency-only use, or operator ownership. Connecting `sandboxNetworkAccess: true` directly to Docker networking would be unsafe by construction.

**Required response:** Keep `true` rejected and replace the model with server-owned policy-profile references. A grant or mission may only select an approved profile and tighten it; request JSON cannot invent destinations or relax it.

### F-SBX-012 — Existing tests prove contracts, not the full hostile boundary

**Severity:** Medium  
**Status:** CONFIRMED

CI runs a targeted sandbox-runner contract spec and the full unit/integration suite. Bundle #12 reports green validation and artifact smoke, but there is no recorded final adversarial proof for malicious sandbox code attempting host-file reads, private-network access, metadata access, DNS rebinding, redirect pivots, process bombs, or cleanup escape.

**Required response:** The final bundle audit must execute hostile fixtures against real Docker and, where supported, rootless Podman. Simulation-only policy tests are necessary but insufficient for a public sandbox claim.

---

## 5. Changes from the prior sandbox plan

The earlier concept centered on enabling network access with SSRF protections. The forensic audit changes that plan in seven important ways.

1. **Unification now comes before networking.** There must be one broker and policy engine before any egress exists.
2. **Guarded-host containment is the first security slice.** The current truth gap is more urgent than adding capability.
3. **Strong offline execution is a prerequisite.** Network policy cannot compensate for a weak filesystem/process boundary.
4. **Dependency acquisition is separated from general egress.** Package resolution is a controlled supply-chain operation, not permission for arbitrary runtime internet access.
5. **The boolean flag is retired, not activated.** Server-owned policy profiles replace it.
6. **Canonical repositories are no longer mounted read-write for untrusted execution.** Copy-in/copy-out and approved mutation boundaries become mandatory.
7. **Adversarial runtime evidence is a shipping gate.** Unit tests and argument-array snapshots alone cannot close the bundle.

---

## 6. Target architecture

### 6.1 Authoritative execution flow

```text
Authenticated caller
  -> capability + ownership + approval check
  -> server-authoritative execution context
  -> SandboxExecutionBroker
  -> EffectiveSandboxPolicy resolver
  -> immutable image + workspace materialization
  -> offline executor OR dependency-acquisition broker OR egress broker
  -> bounded process execution
  -> artifact/patch quarantine
  -> cleanup and reaper
  -> durable redacted evidence + metrics + mission event
```

No caller bypasses this flow. The `bash` tool, validation runners, autonomy repair loop, sandbox API, MCP tools, forensics, and future multi-agent execution all use the same broker.

### 6.2 Server-authoritative context

The broker receives context that cannot be supplied by request JSON:

```ts
interface SandboxAuthorizationContext {
  deploymentMode: 'local' | 'hosted'
  callerKind: 'operator' | 'delegated-grant' | 'team-member' | 'system'
  principalId?: string
  grantId?: string
  missionId?: string
  repositoryId: string
  workspaceId: string
  runtimeMode: SymbolWrightRuntimeMode
  approvedCapabilityIds: readonly string[]
  approvalId?: string
  egressPolicyId?: string
  dependencyPolicyId?: string
}
```

The exact naming may change during implementation, but these authorities must be server-derived and immutable after authorization.

### 6.3 Effective policy

The broker resolves one immutable policy record containing at least:

- backend and trust class;
- image ID and digest;
- workspace materialization mode;
- allowed command/language plan;
- user, capabilities, seccomp/AppArmor profile, namespaces, root filesystem, tmpfs, mounts;
- CPU, memory, PID, wall-time, output, file, artifact, and disk quotas;
- environment allowlist;
- network mode and policy-profile identity;
- dependency acquisition mode;
- artifact export policy;
- cleanup policy and retention;
- evidence and redaction policy.

Policy resolution follows a strict intersection model: global deployment policy ∩ operator profile ∩ grant limits ∩ mission limits ∩ request tightening. No layer may widen a prior layer.

### 6.4 Workspace boundary

Default untrusted execution uses:

1. a new private temporary directory outside the canonical repository;
2. a bounded, symlink-safe snapshot copied into that directory;
3. a container mount of only that temporary workspace;
4. no host home, Git credentials, Docker/Podman socket, SSH agent, provider credentials, cloud metadata token, or unrelated repository state;
5. quarantined output artifacts;
6. an optional bounded patch generated from the before/after manifests;
7. normal SymbolWright review/checkpoint/mutation policy before applying any patch to the canonical repository.

### 6.5 Network states

Use explicit states rather than a boolean:

- `disabled` — no network namespace connectivity;
- `dependency-broker-only` — sandbox itself remains offline; a separate broker acquires approved dependencies;
- `allowlisted-egress` — outbound traffic is forced through the SymbolWright egress broker and an operator-owned profile;
- `unsupported` — requested profile cannot be enforced on this host, so execution is rejected.

There is no `unrestricted` state for delegated or hosted sandbox execution.

---

## 7. Secure dependency-acquisition design

Dependency acquisition must be a separate governed workflow.

### 7.1 Required behavior

- Detect ecosystem and lockfile from the materialized snapshot.
- Require an operator-approved dependency policy for the ecosystem.
- Prefer immutable lockfile resolution; reject or explicitly approve lockfile creation/update.
- Perform downloads in a dedicated acquisition worker or broker, not by granting the execution container general internet access.
- Disable lifecycle scripts during acquisition where the package manager supports it.
- Treat package scripts/build hooks as code execution and run them later only inside the strong offline container under the normal execution policy.
- Restrict registries and source hosts to operator-defined allowlists.
- Block direct IP destinations by default.
- Enforce package count, archive size, expanded size, file count, per-file size, total disk, request count, response size, duration, and concurrency limits.
- Verify checksums/integrity fields supplied by lockfiles and registries.
- Store acquired content in a content-addressed cache with provenance metadata.
- Produce a dependency manifest and SBOM where supported.
- Never forward provider keys, GitHub credentials, operator API keys, SSH agents, Docker credentials, or ambient proxy credentials to package installers.
- Hand the completed dependency layer to an offline execution container.

### 7.2 Ecosystem rollout

The first release should support only ecosystems with a complete enforceable path. Node/npm may be first because current validation already relies heavily on npm, but the bundle must not claim universal secure acquisition until Python, Go, Rust, Java, or other ecosystems meet equivalent gates.

Unsupported ecosystems remain explicit and fail closed.

---

## 8. Brokered egress design

Runtime egress is later and narrower than dependency acquisition.

### 8.1 Policy profiles

Only an operator can create or modify an egress profile. A grant may reference an existing profile only when it has the explicit high-risk capability and required approval.

A profile includes:

- allowed DNS names or suffixes;
- allowed protocols and ports;
- whether redirects are permitted and maximum redirect count;
- maximum requests, bytes sent, bytes received, response size, duration, and concurrency;
- credential policy;
- TLS requirements;
- audit detail and retention;
- deployment/profile scope;
- emergency-disable state.

Raw URLs from model output or repository content do not become policy.

### 8.2 Mandatory SSRF and exfiltration controls

At minimum, the broker must:

- resolve DNS itself;
- validate every resolved IPv4 and IPv6 address;
- block loopback, private, link-local, multicast, unspecified, reserved, and cloud-metadata destinations;
- normalize IPv4-mapped IPv6 and alternate numeric forms before evaluation;
- pin or revalidate the selected address at connection time;
- re-run the full policy on every redirect;
- prevent hostname-to-private-address rebinding;
- validate Host, SNI, certificate name, scheme, and port consistency;
- reject unsupported schemes and protocol upgrades;
- strip ambient proxy variables and unapproved credentials;
- prevent authorization/cookie forwarding across host boundaries;
- bound request and response bodies before buffering;
- terminate on quota, cancellation, policy revision, or emergency kill switch;
- record the hostname, normalized destination class, policy ID/version, decision, byte counts, request count, and denial reason without recording secrets.

### 8.3 Enforcement topology

A sandbox with egress must not receive unrestricted Docker bridge access. All outbound traffic must be technically forced through the broker or an equivalent enforceable proxy/network-policy layer. If the host platform cannot prove that direct bypass is impossible, the profile is `unsupported` and execution is rejected.

---

## 9. Locked Large PR Bundle sequence

This is one Large PR Bundle delivered as seven ordered, independently reviewable PRs. Later PRs must build on merged predecessors; they must not be developed as disconnected parallel alternatives.

### PR 1 of 7 — Truth boundary and guarded-host containment

**Suggested title:** `fix(sandbox): fail closed around guarded-host execution and correct trust claims`

**Objectives:**

- classify guarded-host as trusted local host execution, not sandbox isolation;
- refuse it in hosted mode;
- refuse it for delegated grants, agent teams, external untrusted callers, and public API requests;
- derive runtime mode from authenticated context rather than request JSON;
- replace arbitrary `repository.rootPath` authority with a server-resolved managed workspace reference;
- clamp request-level timeout/resource overrides;
- update docs, inventory, doctor, CLI, dashboard language, and evidence so network/limit claims are truthful;
- add durable audit events for break-glass local operator host execution;
- keep `sandboxNetworkAccess: true` rejected.

**Mandatory tests:** hosted denial, delegated denial, team-member denial, arbitrary-root denial, symlink-root denial, request-mode escalation denial, timeout widening denial, truthful inventory/evidence snapshots.

### PR 2 of 7 — Unified broker, policy model, and capability split

**Suggested title:** `feat(sandbox): add one authoritative execution broker and effective-policy resolver`

**Objectives:**

- introduce `SandboxExecutionBroker` and immutable `EffectiveSandboxPolicy`;
- centralize deployment, caller, ownership, approval, image, workspace, resource, network, artifact, and cleanup decisions;
- implement strict policy intersection and policy versioning;
- split offline execution, dependency acquisition, and egress capabilities;
- migrate grant schema toward server-owned policy references while preserving a safe compatibility read for old false/unset network fields;
- ensure wildcard grants never gain acquisition or egress;
- establish one evidence schema and one redaction boundary;
- add an emergency global sandbox disable switch.

**Mandatory tests:** every authority source, narrowing-only property tests, stale approval/policy version denial, wildcard exclusion, operator-versus-delegated matrix, serialization/migration tests.

### PR 3 of 7 — Real strong offline container executor

**Implementation status:** implemented by PR #336 with a JavaScript-first, digest-pinned,
operator-opt-in backend. Unsupported ecosystems remain fail-closed pending later complete image and
runtime profiles.

**Suggested title:** `feat(sandbox): ship the strong offline container execution backend`

**Objectives:**

- promote the non-executable container plan into the broker's executable backend;
- use digest-pinned allowlisted images and `--pull=never`;
- implement a dedicated temporary copy-in workspace;
- enforce non-root/rootless posture where supported, read-only root filesystem, private PID namespace, dropped capabilities, `no-new-privileges`, PID/memory/CPU/disk/time/output/artifact limits, controlled tmpfs, minimal environment, and no engine socket/home/credential mounts;
- keep network physically disabled;
- implement bounded artifact quarantine and optional patch generation;
- implement cancellation, child/container cleanup, orphan reconciliation, and boot-time reaping;
- report unsupported host controls honestly and fail closed for profiles that require them.

**Mandatory tests:** real container execution, root identity, read-only root, no network, no host home, no engine socket, process bomb, memory pressure, output flood, timeout, cancellation, symlink/mount escape, disk quota, artifact quarantine, crash/restart cleanup, Docker unavailable, image missing, digest mismatch.

### PR 4 of 7 — Migrate every execution caller and remove duplication

**Suggested title:** `refactor(sandbox): route all validation and agent execution through the broker`

**Objectives:**

- migrate `bash`, validation commands, portable validation, autonomy repair, structured sandbox API/tools, MCP, forensics, and multi-agent execution to the broker;
- remove or reduce the existing runtime and portable Docker runners to thin compatibility adapters;
- prohibit direct production Docker argument construction outside the broker backend;
- unify timeout/output/result/error semantics;
- preserve mission evidence, ownership, cancellation, and release-readiness integrations;
- add architecture enforcement tests or lint checks preventing a new bypass.

**Mandatory tests:** call-site inventory coverage, no direct-spawn bypasses for sandbox execution, parity tests for existing approved commands, autonomy validation/repair integration, API/MCP/tool integration, failure and cancellation propagation.

### PR 5 of 7 — Secure dependency acquisition and offline handoff

**Suggested title:** `feat(sandbox): add governed dependency acquisition with offline execution handoff`

**Objectives:**

- add operator-owned dependency policy profiles;
- implement the first complete supported ecosystem path;
- enforce registry/source allowlists, integrity verification, lifecycle-script suppression during fetch, quotas, content-addressed cache, provenance, and SBOM/manifest evidence;
- keep the execution container offline;
- run required package scripts only later inside the strong executor;
- support cache invalidation and emergency disable;
- leave incomplete ecosystems explicit and unsupported.

**Mandatory tests:** malicious lifecycle scripts, tar/zip expansion bombs, file-count bombs, checksum mismatch, lockfile drift, disallowed registry, redirect/private-address pivot, cache poisoning, concurrent acquisition, quota exhaustion, cancellation, credential leakage checks, offline execution proof.

### PR 6 of 7 — Brokered egress, approvals, quotas, and operator UX

**Suggested title:** `feat(sandbox): add policy-profile brokered egress with SSRF defenses`

**Objectives:**

- implement operator-owned egress policy profiles;
- technically force allowed traffic through the broker;
- add DNS/IP/redirect/TLS/protocol/port enforcement and rebinding defense;
- add request/byte/time/concurrency quotas;
- add distinct high-risk capability and approval requirements;
- add policy revision invalidation and emergency kill switch;
- add redacted durable audit evidence, metrics, readiness, CLI/doctor, and dashboard controls;
- expose clear states: disabled, dependency-only, allowlisted, unsupported, denied, quota-exhausted;
- maintain no unrestricted delegated/hosted mode.

**Mandatory tests:** localhost, RFC1918/private IPv4, IPv6 loopback/private/link-local, IPv4-mapped IPv6, metadata endpoints, alternate numeric IP forms, DNS rebinding, CNAME chains, redirects, redirect credential stripping, Host/SNI mismatch, disallowed ports/schemes, proxy environment bypass, direct socket bypass, quota races, cancellation, policy revocation, kill switch, audit redaction.

### PR 7 of 7 — Final adversarial audit and release evidence

**Suggested title:** `docs(audit): complete the strong-sandbox and brokered-egress adversarial audit`

**Objectives:**

- audit the exact post-PR-6 production revision;
- execute clean CI, coverage, build, preflight, release-readiness, packed-artifact, local Docker, and hosted Docker checks;
- run real hostile sandbox fixtures against Docker and supported rootless Podman;
- verify no guarded-host availability in hosted/delegated matrices;
- verify offline and brokered-egress network behavior with local malicious DNS/proxy fixtures;
- verify dependency acquisition and offline handoff;
- verify cleanup after cancellation, timeout, crash, and server restart;
- archive policy/evidence artifacts without secrets;
- publish explicit deployment-shape verdicts.

No new production feature should be added in the final audit PR. A failed gate must reopen the relevant implementation slice or create a clearly identified correction commit before the final attestation.

---

## 10. Definition of Done

The bundle is not complete until all of the following are true.

### Boundary truth

- No production surface calls guarded-host a strong sandbox.
- Guarded-host is impossible in hosted or delegated contexts.
- Every advertised limit and network state is enforced or rejected as unsupported.
- Runtime mode and workspace authority come from authenticated server context.

### One execution authority

- All production sandbox/validation execution flows through one broker.
- There is one policy resolver, one container isolation builder, one evidence schema, and one cleanup lifecycle.
- Static enforcement prevents new direct Docker/spawn bypasses in sandbox-capable subsystems.

### Strong offline execution

- Untrusted code cannot access host home, credentials, unrelated repositories, engine sockets, private host services, or the public network.
- Canonical repositories are not directly write-mounted for untrusted execution.
- Images are immutable and normal execution never pulls them.
- Resource, disk, process, output, artifact, timeout, cancellation, and cleanup controls are real and tested.

### Dependency acquisition

- Supported acquisition is registry/source allowlisted, integrity-checked, quota-bound, provenance-recorded, and separate from offline execution.
- Lifecycle scripts cannot run during acquisition.
- Unsupported ecosystems fail closed without misleading readiness claims.

### Brokered egress

- No direct bridge/public network path exists for delegated/hosted sandbox containers.
- All allowed traffic is forced through an operator-owned policy profile.
- SSRF, DNS rebinding, redirect pivots, alternate address forms, metadata access, credential forwarding, and quota races are covered by adversarial tests.
- Grants can only narrow policies and cannot invent destinations.

### Evidence and operations

- Each execution records policy ID/version, image digest, workspace/input hash, effective limits, network state, dependency manifest hash where applicable, outcome, quotas, artifacts, and cleanup.
- Sensitive values are redacted before persistence and display.
- Readiness reports whether the required sandbox backend and policy controls are actually enforceable.
- Metrics cover active executions, denials by reason, quota exhaustion, acquisition cache behavior, cleanup failures, and broker traffic without high-cardinality secret-bearing labels.
- Emergency disable works without a redeploy.

---

## 11. Adversarial validation matrix

| Attack or failure | Offline container | Dependency broker | Egress broker | Guarded-host policy |
|---|---:|---:|---:|---:|
| Read `/etc/passwd` or host home | Must not expose host data | N/A | Must not expose host data | Hosted/delegated denied |
| Read another repository/workspace | Denied | Denied | Denied | Hosted/delegated denied |
| Docker/Podman socket access | Denied | Denied | Denied | Hosted/delegated denied |
| Public internet access | Denied | Broker-only | Profile-only | Not asserted as disabled locally |
| Loopback/private/link-local access | Denied | Denied | Denied | Hosted/delegated denied |
| Cloud metadata access | Denied | Denied | Denied | Hosted/delegated denied |
| DNS rebinding | No DNS path | Denied | Denied | Hosted/delegated denied |
| Redirect to private destination | No network path | Denied | Denied | Hosted/delegated denied |
| Dependency lifecycle script | Offline only | Suppressed during fetch | N/A | Hosted/delegated denied |
| Archive expansion bomb | Bounded input | Denied by quotas | Bounded response | Hosted/delegated denied |
| Fork/process bomb | PID/cgroup bound | Worker bound | PID/cgroup bound | Hosted/delegated denied |
| Memory/CPU/disk exhaustion | Bound and evidenced | Bound and evidenced | Bound and evidenced | Hosted/delegated denied |
| Output flood | Bound, killed, redacted | Bound, killed, redacted | Bound, killed, redacted | Hosted/delegated denied |
| Timeout/cancellation | Process tree and container removed | Acquisition aborted/cleaned | Requests aborted/cleaned | Local break-glass audited |
| Crash/restart orphan | Reaped/reconciled | Reaped/reconciled | Reaped/reconciled | Local break-glass audited |
| Policy revocation mid-run | Cancel or deny next operation | Cancel | Cancel active requests | N/A |
| Credential exfiltration | No credentials injected | No ambient credentials | Only explicit scoped credential policy | Hosted/delegated denied |

---

## 12. Rollout and compatibility

### 12.1 Existing `sandboxNetworkAccess`

- Current behavior rejecting `true` remains correct.
- `false` or absent remains compatible with offline execution.
- The field is deprecated once policy-profile references exist.
- Migration must never reinterpret a historical `true` value as authorization; any legacy persisted value must fail closed and require operator review.

### 12.2 Guarded-host

- Hosted and delegated use becomes a hard error.
- Local operator use, if retained, requires an explicit break-glass variable and an operator-facing warning on every execution.
- No automatic fallback from container failure to host execution is allowed.

### 12.3 Existing validation behavior

- Preserve approved command semantics and outputs where compatible with the stronger workspace model.
- Any workflow that depends on mutating the live repository during validation must be redesigned to return a patch/artifact or explicitly classified as trusted-local execution; it must not silently weaken the untrusted profile.

### 12.4 Images and caches

- Normal execution is offline and `--pull=never`.
- Image and dependency preparation are explicit operator actions.
- Digest or policy changes invalidate readiness and relevant caches until revalidated.

---

## 13. Deployment gates after completion

| Deployment shape | Required sandbox verdict |
|---|---|
| Local single operator | Strong offline container GO; optional host break-glass clearly classified and audited. |
| Open-source technical preview | GO when docs accurately distinguish available and unsupported profiles. |
| Controlled self-hosted delegated grants | Strong offline container PASS; guarded-host impossible; dependency/egress profiles operator-controlled. |
| Controlled single-node hosted beta | All above plus hosted TLS/governance, real adversarial Docker evidence, quotas, readiness, and incident controls. |
| Public self-service hosted beta | Independent adversarial review, production infrastructure validation, secret scanning, abuse controls, backup/restore, and operational runbooks in addition to this bundle. |
| Horizontal/multi-node service | Distributed execution scheduling, policy consistency, quota ledger, cancellation, and artifact governance remain separate prerequisites. |

This bundle alone must not be used to upgrade SymbolWright's current public self-service or horizontal-scale verdict without the other Bundle #12 follow-up evidence and distributed-control-plane work.

---

## 14. Immediate operator decision

**Proceed with this revised plan when sandbox work resumes.**

Do not implement network access as an isolated first PR. The first implementation PR must close the guarded-host truth boundary and keep all network capability disabled. The first genuinely new capability should be the unified strong offline container executor; secure acquisition and egress follow only after that foundation is proven.

Until then, the present safest state is:

- Docker validation remains offline;
- unsupported `sandboxNetworkAccess: true` remains rejected;
- guarded-host remains disabled by default and should not be enabled in hosted or delegated use;
- SymbolWright must not advertise public untrusted sandboxing or network-enabled autonomous dependency installation as production-ready.
