# CodeMind Universal Sandbox Runtime

This document tracks the Bundle #4 sandbox runtime rollout. The current implementation is intentionally conservative: CodeMind can discover runtimes, expose sandbox inventory, persist sandbox evidence, and show image policy diagnostics, but it does not yet execute host or container code through the new sandbox backend.

## Current implemented slices

- Shared sandbox request/result/policy model.
- Authenticated `/api/sandbox/*` routes in the unified server.
- Local `.codemind/sandbox/` execution history records.
- Runtime discovery probes for common language commands and container engines.
- Explicit container image allowlist.
- Read-only sandbox doctor and image diagnostics renderer.
- Read-only image inspection and operator-reviewed preparation-plan command contracts.

## Trust classes

CodeMind distinguishes these runtime trust classes:

- `browser-isolated`: browser worker, Pyodide, sql.js, or sandboxed preview style execution.
- `container-isolated`: reserved for a future container backend that enforces real isolation controls.
- `wasm-isolated`: reserved for constrained WebAssembly runtimes.
- `guarded-host`: local child-process execution on the CodeMind host. This is not a strong sandbox and remains disabled by default.
- `unavailable`: no runtime is available or allowed.

## Runtime discovery

Runtime discovery runs bounded version checks only. It does not execute repository code, run package managers, install dependencies, or download runtimes. Discovery uses argument arrays with `shell: false`, timeout caps, and a minimal environment allowlist.

## Container image policy

Container images are an explicit allowlist. Browser requests cannot supply arbitrary image names. Images are not pulled automatically during normal execution. The image policy marks images as disabled and not installed until a later operator-reviewed inspection/preparation workflow exists.

## Sandbox doctor

The sandbox doctor report is read-only. It reports:

- detected language runtime versions;
- Docker or Podman detection status;
- guarded-host opt-in state;
- image allowlist entries;
- operator-reviewed image preparation command hints;
- warnings about unsupported or future execution behavior.

Preparation commands are advisory. CodeMind does not run them automatically.

## Image command contracts

The sandbox image command contract accepts allowlisted image IDs only, never raw image names. The renderer contract currently covers future top-level commands shaped like:

```bash
codemind sandbox inspect node-22-bookworm-slim
codemind sandbox prepare python-3-12-slim
```

These commands are designed as read-only operator guidance. Inspection renders the image policy record CodeMind already knows about. Preparation renders a review-only command plan when Docker or Podman has been detected. CodeMind does not run that command, pull the image, execute containers, or mutate the host in this slice.

Raw image names such as `node:22-bookworm-slim` or registry paths are rejected because browser and CLI requests must not select arbitrary container images.

Top-level CLI switch wiring may land in a follow-up slice. Until that switch is wired, tests exercise the renderer contract directly rather than claiming the published binary command is active.

## Security boundary

The sandbox runtime currently does not claim server-side code execution is available. Until a real backend lands, server execution requests remain policy-blocked or unavailable. Browser-isolated runners keep their existing behavior.

Out of scope for the current slice:

- image pulls;
- automatic dependency installation;
- arbitrary Docker images;
- arbitrary container flags;
- network access for sandboxed code;
- host shell fallback;
- background job execution;
- container execution.
