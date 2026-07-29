# SymbolWright Universal Sandbox Runtime

This document tracks the Bundle #4 sandbox runtime rollout and the current execution boundary.

SymbolWright presently has three categories of server-side execution:

1. The structured universal sandbox service under `src/sandbox/`, including an opt-in strong offline JavaScript container backend governed by `SandboxExecutionBroker`.
2. Brokered trusted-local command compatibility under `src/sandbox/sandbox-command-backend.ts`, with thin runtime and portability adapters for approved local validation workflows.
3. The `guarded-host` backend, which directly runs trusted local host language processes only when a local operator explicitly opts in.

The guarded-host backend is **not a strong sandbox**. The trusted-local command compatibility backend is also **not the hostile-code strong sandbox** because it bind-mounts the canonical repository read-write and uses operator-controlled compatibility images. Both paths are forbidden for hosted, delegated, team-member, and external-untrusted execution and are never automatic fallbacks from the strong container backend.

## Current execution architecture

Structured sandbox requests and approved command requests pass through `SandboxExecutionBroker` before an executor can create a process or container.

Structured requests resolve an immutable, fingerprinted `EffectiveSandboxPolicy` from server-owned deployment, caller, grant, mission, workspace, runner, image, resource, and request-tightening authority. Approved command requests resolve an immutable, fingerprinted `EffectiveSandboxCommandPolicy` from a server-owned command profile, exact command, deployment/caller authority, mission/grant restrictions, workspace trust, and minimum-only limits.

The currently executable strong profile is offline only. Dependency acquisition and allowlisted runtime egress remain separate unsupported future profiles; no network authority is added by the execution-caller migration.

## Current implemented slices

- Shared sandbox request/result/policy model.
- One authoritative execution broker and effective-policy resolver.
- Authenticated `/api/sandbox/*` routes in the unified server.
- Local `.symbolwright/sandbox/` execution history and redacted policy evidence.
- Runtime discovery probes for common language commands and Docker/Podman.
- One digest-pinned, operator-opt-in JavaScript strong-container runner.
- `--pull=never` strong execution with pre-execution digest verification.
- Private copy-in workspace outside the canonical repository.
- Quota-bounded tmpfs `/workspace` and `/tmp` inside the strong container.
- Read-only strong-container root filesystem, numeric non-root user, dropped capabilities, no-new-privileges, private PID/IPC namespaces, and bounded CPU/memory/PIDs.
- Physical container network mode `none`.
- Bounded output, timeout, source, file, workspace, and artifact limits.
- Copy-out only to artifact quarantine, with changed-file manifests and an optional bounded patch.
- Cancellation, mandatory removal, process cleanup, shutdown cancellation, and boot-time orphan reaping.
- Read-only sandbox doctor and image diagnostics.
- Guarded-host execution for explicitly opted-in trusted local use; disabled by default and not a strong sandbox.
- Broker-owned command profiles for runtime and portable validation commands.
- Centralized trusted-local Docker argument construction and process spawning under `src/sandbox/`.
- `bash`, test/lint/typecheck tools, validation gates, portable validation, autonomy repair validation, forensics/preflight, structured API, and agent-tool execution all enter a brokered sandbox path.
- Mission-owned command authority propagation, including exact delegated-grant capability and command restrictions.
- Architecture enforcement tests that reject direct container construction in runtime and portability adapters.

## Trust classes

SymbolWright distinguishes these runtime trust classes:

- `browser-isolated`: browser worker, Pyodide, sql.js, or preview-style execution.
- `container-isolated`: the strong offline container backend when every required engine, image, workspace, isolation, quota, cleanup, and evidence control is enforceable.
- `wasm-isolated`: reserved for constrained WebAssembly runtimes.
- `guarded-host`: local child-process execution on the SymbolWright host. This is not a strong sandbox and may retain host filesystem/network reach according to the operating-system account.
- `unavailable`: no runtime or enforceable policy is available.

The trusted-local command compatibility backend has its own explicit execution class, `trusted-local-container-compatibility`. It is not represented as `container-isolated` because a read-write bind mount of the canonical repository is intentionally retained for approved local operator workflows.

Inventory fields such as `capabilities.network: false` and `networkPolicy: disabled` describe a runner contract. For the strong container backend, that contract is implemented with container network mode `none`. It is not proof of network isolation for guarded-host execution.

## Strong offline container executor

The first executable universal container profile supports JavaScript using the built-in allowlist entry:

```text
node-26-alpine-pinned
node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66
```

The operator must preinstall that exact digest and explicitly set:

```bash
SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION=true
```

Normal strong execution uses `--pull=never`; SymbolWright does not download images while servicing a strong sandbox request. Unsupported languages and missing/mismatched images fail closed.

### Workspace boundary

The strong backend:

1. creates a private temporary directory outside the canonical repository;
2. copies only the validated source or selected managed-repository snapshot into it;
3. rejects symlinks, traversal, non-regular files, and excluded state directories;
4. creates a container with no host bind mounts;
5. copies the bounded snapshot into a quota-limited `/workspace` tmpfs;
6. executes there;
7. copies results to a separate host quarantine directory;
8. exports only bounded changed-file artifacts, a change manifest, and an optional patch;
9. deletes the temporary execution workspace;
10. never applies generated files to the canonical repository automatically.

No host home, `.git`, `.symbolwright`, `.codemind`, `node_modules`, Docker/Podman socket, SSH agent, provider credential, cloud token, registry credential, or ambient proxy variable is mounted or forwarded.

### Container controls

The generated strong-container create/exec plan includes:

- digest-pinned image identity;
- `--pull=never`;
- `--network none`;
- private PID namespace;
- disabled IPC sharing;
- read-only root filesystem;
- all Linux capabilities dropped;
- `no-new-privileges`;
- numeric non-root UID/GID;
- CPU, memory, memory-swap, and PID limits;
- quota-bounded tmpfs mounts for `/workspace` and `/tmp`;
- a minimal environment;
- an init process for child reaping;
- no bind mounts or arbitrary container arguments.

A request cannot select an arbitrary image, engine option, mount, environment variable, UID, hostname, or network mode.

### Cleanup and reconciliation

Every strong execution attempts forceful container removal with volumes and removes its temporary host workspace. Timeout, output flood, cancellation, and other terminal paths kill the execution container before cleanup. The server cancels active containers during graceful shutdown and performs boot-time reaping of containers labeled as SymbolWright-managed.

The artifact quarantine may persist according to normal local sandbox-history retention so operators can review evidence. Quarantined output is not trusted repository content.

## Runtime discovery

Runtime discovery runs bounded version checks only. It does not execute repository code, run package managers, install dependencies, pull images, or download runtimes. Discovery uses argument arrays with `shell: false`, timeout caps, and a minimal environment allowlist.

## Guarded-host execution

Guarded-host execution is available only when all applicable policy checks pass and `SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true` is set.

It creates a temporary working directory, uses fixed runtime/compiler plans with `shell: false`, passes a reduced environment, bounds time/output, kills the process group where supported, and removes its workspace.

It does **not** enforce the full sandbox limits at the operating-system boundary and does not isolate the child from the host network or all host-readable files. It is a trusted-local break-glass capability, not a safe fallback when Docker is unavailable. No container failure may silently fall back to guarded-host execution.

## Container image policy and operator diagnostics

Strong-container images are a built-in digest-pinned allowlist. Browser, API, CLI, mission, and model requests cannot supply raw strong-container image names. `symbolwright sandbox doctor`, `symbolwright sandbox images`, and `symbolwright sandbox inspect <image-id>` provide read-only detection and inspection.

Example preparation and inspection flow:

```bash
symbolwright sandbox doctor
symbolwright sandbox images
symbolwright sandbox inspect node-26-alpine-pinned
docker pull node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66
```

The pull command is an operator-reviewed preparation action, not something performed during a strong sandbox request. The executor verifies that the local image reports the allowlisted digest before creating a container.

## Brokered trusted-local command compatibility

Approved local validation workflows use a centralized compatibility backend in `src/sandbox/sandbox-command-backend.ts`. The former runtime and portable Docker runners are thin adapters and no longer construct Docker isolation arguments or spawn processes themselves.

The broker resolves a server-owned command profile before execution. It enforces:

- `APPROVED_EXECUTION` and the offline sandbox capability;
- local deployment only;
- operator or trusted-system caller only;
- trusted-local workspace classification only;
- shell-free argument-array parsing;
- profile-owned executable allowlists;
- exact delegated-grant command restrictions where applicable;
- minimum-only timeout and output limits;
- physical Docker network mode `none`;
- dropped capabilities and `no-new-privileges`;
- no host fallback;
- a fingerprinted decision record with a hashed workspace root.

This compatibility path deliberately retains a read-write bind mount of the canonical repository and operator-controlled ecosystem images so existing approved local validation and formatting workflows can mutate the working tree. It is therefore **not suitable for hostile or externally supplied repositories**. Hosted, delegated, team-member, and external-untrusted contexts fail closed and must use a supported strong copy-in profile; unsupported ecosystems remain unavailable rather than falling back to the compatibility mount.

## Network access and dependency acquisition

- The strong container executor and trusted-local command compatibility backend use container network mode `none`.
- `executionLimits.sandboxNetworkAccess: true` remains rejected.
- Guarded-host cannot truthfully claim network isolation.
- Automatic dependency installation is not part of the executor.
- Arbitrary runtime internet access is not supported.

The locked bundle sequence adds dependency acquisition later as a separate governed broker. Runtime egress comes later still and only through operator-owned profiles with enforced DNS, SSRF, redirect, TLS, quota, approval, bypass-prevention, and audit controls.

## Security boundary

Current truthful posture:

- Browser-isolated runners retain their browser behavior.
- The universal service has one real JavaScript-first strong offline container backend when explicitly enabled and fully prepared.
- Other strong-container language ecosystems remain unsupported and fail closed.
- Approved local command workflows now enter the authoritative broker through a clearly labeled trusted-local compatibility backend.
- The compatibility backend is impossible for hosted, delegated, team-member, and external-untrusted execution.
- Guarded-host remains trusted local break-glass execution only.
- General sandbox network access and dependency acquisition remain unavailable.
- No automatic fallback exists from container execution to host execution.

Remaining bundle work includes governed dependency acquisition, brokered allowlisted egress, and a final independent adversarial audit before any broad public multi-tenant sandbox claim.
