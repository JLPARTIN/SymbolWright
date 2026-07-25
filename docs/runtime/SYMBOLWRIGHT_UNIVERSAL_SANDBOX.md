# SymbolWright Universal Sandbox Runtime

This document tracks the Bundle #4 sandbox runtime rollout. The current implementation is intentionally conservative: SymbolWright can discover runtimes, expose sandbox inventory, persist sandbox evidence, and show image policy diagnostics, but it does not yet execute host or container code through the new sandbox backend.

## Current implemented slices

- Shared sandbox request/result/policy model.
- Authenticated `/api/sandbox/*` routes in the unified server.
- Local `.symbolwright/sandbox/` execution history records.
- Runtime discovery probes for common language commands and container engines.
- Explicit container image allowlist.
- Read-only sandbox doctor and image diagnostics renderer.
- Read-only image inspection and operator-reviewed preparation-plan command contracts.
- Top-level `codemind sandbox ...` CLI routing through the existing CLI entrypoint.
- Read-only local image-store inspection for allowlisted image IDs only.
- Container backend policy skeleton for future no-network isolated execution.
- Review-only container command planner for future Docker/Podman execution.

## Trust classes

SymbolWright distinguishes these runtime trust classes:

- `browser-isolated`: browser worker, Pyodide, sql.js, or sandboxed preview style execution.
- `container-isolated`: reserved for a future container backend that enforces real isolation controls.
- `wasm-isolated`: reserved for constrained WebAssembly runtimes.
- `guarded-host`: local child-process execution on the SymbolWright host. This is not a strong sandbox and remains disabled by default.
- `unavailable`: no runtime is available or allowed.

## Runtime discovery

Runtime discovery runs bounded version checks only. It does not execute repository code, run package managers, install dependencies, or download runtimes. Discovery uses argument arrays with `shell: false`, timeout caps, and a minimal environment allowlist.

## Container image policy

Container images are an explicit allowlist. Browser requests cannot supply arbitrary image names. Images are not pulled automatically during normal execution. The default inventory keeps images disabled and marks them not installed; `codemind sandbox inspect <image-id>` can separately read allowlisted local image-store metadata when Docker or Podman is detected.

## Container execution policy skeleton

The container policy skeleton defines the contract a future backend must satisfy before it can truthfully report `container-isolated` execution. The plan is intentionally non-executable for now.

Required controls include:

- network policy `disabled`;
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
- bounded CPU, memory, process count, timeout, output, and artifact limits;
- cleanup required after every execution attempt.

This policy plan does not create, start, pull, inspect, or remove containers. A later backend slice must enforce the policy before any server-side container execution can be enabled.

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
codemind sandbox doctor
codemind sandbox images
codemind sandbox inspect node-22-bookworm-slim
codemind sandbox prepare python-3-12-slim
```

Inspection is read-only. It may call the detected container engine to inspect an allowlisted image already present in the local image store. It does not acquire images, execute containers, mount volumes, pass arbitrary image names, or mutate the host. Preparation renders a review-only command plan when Docker or Podman has been detected. SymbolWright does not run that command, download the image, execute containers, or mutate the host in this slice.

Raw image names such as `node:22-bookworm-slim` or registry paths are rejected because browser and CLI requests must not select arbitrary container images.

## Security boundary

The sandbox runtime currently does not claim server-side code execution is available. Until a real backend lands, server execution requests remain policy-blocked or unavailable. Browser-isolated runners keep their existing behavior.

Out of scope for the current slice:

- automatic image acquisition;
- automatic dependency installation;
- arbitrary Docker images;
- arbitrary container flags;
- network access for sandboxed code;
- host shell fallback;
- background job execution;
- container execution.
