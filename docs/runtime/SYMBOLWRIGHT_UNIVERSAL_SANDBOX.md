# SymbolWright Universal Sandbox Runtime

This document tracks the Bundle #4 sandbox runtime rollout and the current execution boundary.

SymbolWright presently has three categories of server-side execution:

1. The structured universal sandbox service under `src/sandbox/`, including an opt-in strong offline JavaScript container backend governed by `SandboxExecutionBroker`.
2. Docker-based validation runners under `src/runtime/sandbox/` and `src/portability/`, which still construct separate policies for approved validation workflows and will be migrated in Sandbox Bundle PR 4.
3. The `guarded-host` backend, which directly runs trusted local host language processes only when a local operator explicitly opts in.

The guarded-host backend is **not a strong sandbox**. It does not create container, virtual-machine, WASM, filesystem-jail, or network-namespace isolation. It remains forbidden for hosted or delegated callers and is never an automatic fallback from container execution.

## Current execution architecture

Structured server sandbox requests pass through `SandboxExecutionBroker`, which resolves an immutable, fingerprinted `EffectiveSandboxPolicy` from server-owned deployment, caller, grant, mission, workspace, runner, image, resource, and request-tightening authority.

The currently executable strong profile is offline only. Dependency acquisition and allowlisted runtime egress remain separate unsupported future profiles; no network authority is added by the strong-container slice.

## Current implemented slices

- Shared sandbox request/result/policy model.
- One authoritative execution broker and effective-policy resolver.
- Authenticated `/api/sandbox/*` routes in the unified server.
- Local `.symbolwright/sandbox/` execution history and redacted policy evidence.
- Runtime discovery probes for common language commands and Docker/Podman.
- One digest-pinned, operator-opt-in JavaScript strong-container runner.
- `--pull=never` normal execution with pre-execution digest verification.
- Private copy-in workspace outside the canonical repository.
- Quota-bounded tmpfs `/workspace` and `/tmp` inside the container.
- Read-only container root filesystem, numeric non-root user, dropped capabilities, no-new-privileges, private PID/IPC namespaces, and bounded CPU/memory/PIDs.
- Physical container network mode `none`.
- Bounded output, timeout, source, file, workspace, and artifact limits.
- Copy-out only to artifact quarantine, with changed-file manifests and an optional bounded patch.
- Cancellation, mandatory removal, process cleanup, shutdown cancellation, and boot-time orphan reaping.
- Read-only sandbox doctor and image diagnostics.
- Guarded-host execution for explicitly opted-in trusted local use; disabled by default and not a strong sandbox.
- Separate legacy Docker validation runners awaiting broker migration in PR 4.

## Trust classes

SymbolWright distinguishes these runtime trust classes:

- `browser-isolated`: browser worker, Pyodide, sql.js, or preview-style execution.
- `container-isolated`: the strong offline container backend when every required engine, image, workspace, isolation, quota, cleanup, and evidence control is enforceable.
- `wasm-isolated`: reserved for constrained WebAssembly runtimes.
- `guarded-host`: local child-process execution on the SymbolWright host. This is not a strong sandbox and may retain host filesystem/network reach according to the operating-system account.
- `unavailable`: no runtime or enforceable policy is available.

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

Normal execution uses `--pull=never`; SymbolWright does not download images while servicing a sandbox request. Unsupported languages and missing/mismatched images fail closed.

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

The generated create/exec plan includes:

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

Every execution attempts forceful container removal with volumes and removes its temporary host workspace. Timeout, output flood, cancellation, and other terminal paths kill the execution container before cleanup. The server cancels active containers during graceful shutdown and performs boot-time reaping of containers labeled as SymbolWright-managed.

The artifact quarantine may persist according to normal local sandbox-history retention so operators can review evidence. Quarantined output is not trusted repository content.

## Runtime discovery

Runtime discovery runs bounded version checks only. It does not execute repository code, run package managers, install dependencies, pull images, or download runtimes. Discovery uses argument arrays with `shell: false`, timeout caps, and a minimal environment allowlist.

## Guarded-host execution

Guarded-host execution is available only when all applicable policy checks pass and `SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true` is set.

It creates a temporary working directory, uses fixed runtime/compiler plans with `shell: false`, passes a reduced environment, bounds time/output, kills the process group where supported, and removes its workspace.

It does **not** enforce the full sandbox limits at the operating-system boundary and does not isolate the child from the host network or all host-readable files. It is a trusted-local break-glass capability, not a safe fallback when Docker is unavailable. No container failure may silently fall back to guarded-host execution.

## Container image policy and operator diagnostics

Container images are a built-in digest-pinned allowlist. Browser, API, CLI, mission, and model requests cannot supply raw image names. `symbolwright sandbox doctor`, `symbolwright sandbox images`, and `symbolwright sandbox inspect <image-id>` provide read-only detection and inspection.

Example preparation and inspection flow:

```bash
symbolwright sandbox doctor
symbolwright sandbox images
symbolwright sandbox inspect node-26-alpine-pinned
docker pull node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66
```

The pull command is an operator-reviewed preparation action, not something performed during a sandbox request. The executor verifies that the local image reports the allowlisted digest before creating a container.

## Docker validation runners

The Docker runners under `src/runtime/sandbox/` and `src/portability/` are separate real execution paths used for approved validation workflows. They disable networking, drop capabilities, use no-new-privileges, apply selected limits, and do not fall back to host execution.

They still construct separate Docker policies and directly bind-mount the working repository read-write. They are not the new universal hostile-code strong-container backend. Sandbox Bundle PR 4 must migrate those callers through the authoritative broker and remove duplicated policy construction.

## Network access and dependency acquisition

- The strong container executor and legacy Docker validation runners use network mode `none`.
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
- Legacy Docker validation paths remain outside the unified broker until PR 4.
- Guarded-host remains trusted local break-glass execution only.
- General sandbox network access and dependency acquisition remain unavailable.
- No automatic fallback exists from container execution to host execution.

Remaining bundle work includes migrating every legacy execution caller, governed dependency acquisition, brokered allowlisted egress, and a final independent adversarial audit before any broad public multi-tenant sandbox claim.
