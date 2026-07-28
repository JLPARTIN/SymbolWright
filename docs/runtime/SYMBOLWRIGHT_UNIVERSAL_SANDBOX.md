# SymbolWright Universal Sandbox Runtime

This document tracks the Bundle #4 sandbox runtime rollout and the current execution boundary.

SymbolWright presently has two different categories of server-side execution:

1. Docker-based validation runners under `src/runtime/sandbox/` and `src/portability/`, which execute a restricted set of validation commands with Docker networking disabled.
2. The structured universal sandbox service under `src/sandbox/`, whose container policy/command plan remains non-executable but whose `guarded-host` backend can directly run local host language processes when an operator explicitly opts in.

The guarded-host backend is **not a strong sandbox**. It does not create container, virtual-machine, WASM, filesystem-jail, or network-namespace isolation. It must remain disabled for hosted or delegated untrusted execution. The current forensic build plan for replacing these divergent paths with one authoritative strong-sandbox broker is `docs/security/SANDBOX_LARGE_PR_BUNDLE_BUILD_PLAN.md`.

## Current execution architecture

Structured server sandbox requests now pass through `SandboxExecutionBroker`, which resolves an
immutable `EffectiveSandboxPolicy` from server-owned deployment, caller, grant, mission, workspace,
runner, resource, and request-tightening authority. The broker currently resolves the offline
profile only. Dependency acquisition and allowlisted egress remain explicit unsupported future
profiles; no network access is enabled by this architecture slice.

## Current implemented slices

- Shared sandbox request/result/policy model.
- Authenticated `/api/sandbox/*` routes in the unified server.
- Local `.symbolwright/sandbox/` execution history records.
- Runtime discovery probes for common language commands and container engines.
- Explicit container image allowlist.
- Read-only sandbox doctor and image diagnostics renderer.
- Read-only image inspection and operator-reviewed preparation-plan command contracts.
- Top-level `symbolwright sandbox ...` CLI routing through the existing CLI entrypoint.
- Read-only local image-store inspection for allowlisted image IDs only.
- Container backend policy skeleton for future network-disabled isolated execution.
- Review-only container command planner for future Docker/Podman execution.
- Guarded-host execution backend for explicitly opted-in trusted local use; disabled by default and not a strong sandbox.
- Separate Docker-based validation runners used by approved agent/validation workflows; these are not yet unified with the universal sandbox policy skeleton.

## Trust classes

SymbolWright distinguishes these runtime trust classes:

- `browser-isolated`: browser worker, Pyodide, sql.js, or sandboxed preview-style execution.
- `container-isolated`: reserved in the universal sandbox model for a future container backend that enforces the complete strong-isolation contract.
- `wasm-isolated`: reserved for constrained WebAssembly runtimes.
- `guarded-host`: local child-process execution on the SymbolWright host. This is not a strong sandbox, may retain host filesystem/network reach according to the operating-system account, and remains disabled by default.
- `unavailable`: no runtime is available or allowed.

Inventory fields such as `capabilities.network: false` and `networkPolicy: disabled` describe the intended runner contract. They must not be interpreted as proof of network isolation for guarded-host execution, because the guarded-host backend does not enforce a network namespace.

## Runtime discovery

Runtime discovery runs bounded version checks only. It does not execute repository code, run package managers, install dependencies, or download runtimes. Discovery uses argument arrays with `shell: false`, timeout caps, and a minimal environment allowlist.

## Guarded-host execution

Guarded-host execution is available only when all applicable policy checks pass and `SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true` is set.

It:

- creates a temporary working directory;
- materializes approved source into that directory;
- uses fixed language runtime/compiler command plans with `shell: false`;
- passes a reduced environment;
- bounds execution time and captured output;
- kills the process group on cancellation/timeout where supported;
- removes the temporary workspace after execution.

It does **not** enforce the full declared sandbox limits at the operating-system boundary and does not isolate the child from the host network or all host-readable files. It is therefore a trusted-local break-glass capability, not a safe fallback when Docker is unavailable. No container failure may silently fall back to guarded-host execution.

## Container image policy

Container images are an explicit allowlist. Browser requests cannot supply arbitrary image names. Images are not pulled automatically by the universal sandbox service. The default inventory keeps images disabled and marks them not installed; `symbolwright sandbox inspect <image-id>` can separately read allowlisted local image-store metadata when Docker or Podman is detected.

The current allowlist uses friendly image tags for planning/inspection. Before the future backend can make a production `container-isolated` claim, executable images must be operator-approved and pinned to immutable digests.

## Container execution policy skeleton

The container policy skeleton defines the contract a future backend must satisfy before it can truthfully report `container-isolated` execution. The plan is intentionally non-executable for now.

Required controls include:

- network policy `disabled` by default;
- no privileged containers;
- no host PID namespace;
- no host network;
- no container-engine socket mounts;
- no home-directory mounts;
- no arbitrary mounts;
- no arbitrary user-supplied container arguments;
- no registry credentials from browser requests;
- non-root execution;
- dropped Linux capabilities;
- disabled privilege escalation;
- read-only root filesystem where workable;
- writable temporary workspace only;
- minimal environment allowlist;
- bounded CPU, memory, process count, disk, timeout, output, and artifact limits;
- cleanup required after every execution attempt;
- immutable image identity and no normal-execution image pull;
- server-authoritative workspace identity and symlink-safe materialization;
- no direct read-write mount of the canonical repository for untrusted execution.

This policy plan does not create, start, pull, inspect, or remove containers. A later backend slice must enforce the policy before universal server-side container execution can be enabled.

## Container command planner

The container command planner turns an allowlisted image, detected Docker/Podman engine, temporary workspace path, fixed entrypoint, and bounded limits into a review-only argument array.

The generated plan includes safety controls such as:

- `--pull=never` to prevent automatic image acquisition;
- `--network none`;
- private PID namespace;
- read-only root filesystem;
- dropped capabilities;
- no-new-privileges security option;
- non-root user;
- bounded memory, CPU, and process count;
- controlled temporary workspace mount only;
- minimal environment variables.

The planner rejects request-shaped attempts to supply arbitrary container options, arbitrary image names, unsafe workspace paths, host home paths, Git directories, and container-engine socket paths. The plan remains `executionEnabled: false`; it is not an execution backend and SymbolWright does not run the generated argv in this slice.

The future executable backend must strengthen path canonicalization, immutable image identity, disk/artifact limits, cleanup reconciliation, and copy-in/copy-out workspace handling before relying on this plan for hostile code.

## Docker validation runners

The Docker runners under `src/runtime/sandbox/` and `src/portability/` are real execution paths used for approved command and repository validation workflows. They currently:

- disable Docker networking;
- drop capabilities and set no-new-privileges;
- apply selected time, memory, CPU, and output limits;
- run command binaries through argument arrays rather than a shell;
- fail rather than falling back to host execution when Docker is unavailable.

They also construct separate Docker policies and directly bind-mount the working repository read-write. They do not yet satisfy the complete future universal container contract. They should be treated as offline validation runners for trusted/local workflows, not as a completed public multi-tenant strong sandbox.

## Sandbox doctor

The sandbox doctor report is read-only. It reports:

- detected language runtime versions;
- Docker or Podman detection status;
- guarded-host opt-in state;
- image allowlist entries;
- operator-reviewed image preparation command hints;
- warnings about unsupported or future execution behavior.

Preparation commands are advisory. SymbolWright does not run them automatically.

## Image command contracts

The sandbox image command contract accepts allowlisted image IDs only, never raw image names. The top-level CLI currently supports:

```bash
symbolwright sandbox doctor
symbolwright sandbox images
symbolwright sandbox inspect node-22-bookworm-slim
symbolwright sandbox prepare python-3-12-slim
```

Inspection is read-only. It may call the detected container engine to inspect an allowlisted image already present in the local image store. It does not acquire images, execute containers, mount volumes, pass arbitrary image names, or mutate the host. Preparation renders a review-only command plan when Docker or Podman has been detected. SymbolWright does not run that command, download the image, execute containers, or mutate the host in this slice.

Raw image names such as `node:22-bookworm-slim` or registry paths are rejected because browser and CLI requests must not select arbitrary container images.

## Network access and dependency acquisition

- The current Docker validation runners use `--network none`.
- `executionLimits.sandboxNetworkAccess: true` is rejected because no supported strong-sandbox egress path exists.
- Guarded-host cannot truthfully claim network isolation.
- Automatic dependency installation and arbitrary runtime internet access are not supported strong-sandbox capabilities.

The revised build plan keeps strong execution offline first, adds dependency acquisition as a separate governed broker, and permits later runtime egress only through operator-owned policy profiles with enforced SSRF, DNS, redirect, quota, approval, and audit controls.

## Security boundary

Current truthful posture:

- Browser-isolated runners retain their browser execution behavior.
- Docker validation runners provide useful offline validation isolation but are not yet the unified completed strong-container backend.
- The universal container backend remains non-executable.
- Guarded-host is real local host execution behind an explicit opt-in and is not a strong sandbox.
- Public hosted/delegated untrusted sandbox execution and general sandbox network access are not production-ready.

Out of scope until the revised sandbox bundle lands:

- automatic image acquisition during normal execution;
- governed dependency acquisition;
- arbitrary Docker images or container flags;
- brokered sandbox egress;
- hosted/delegated guarded-host execution;
- automatic fallback from container execution to host execution;
- a production claim of public multi-tenant strong sandboxing.
