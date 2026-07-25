# SymbolWright Secure Sandbox Runner

SymbolWright is execution-first, but workspace mutation and command execution must not run directly against the host process.

This runner layer keeps the Claude Code-style operator experience while routing risky tool surfaces through a bounded container boundary.

## Architecture

```text
Host SymbolWright Orchestrator
  -> sandbox runner adapter
    -> docker run --rm
      -> /workspace mounted scratch workspace
      -> command/file-write worker
```

The host orchestrator owns planning, Ajna review, HiveMind dispatch, memory, and workspace state. The sandbox owns shell execution and file mutation.

## Security Contract

The Docker runner is constructed with these default constraints:

- `--cap-drop=ALL`
- `--security-opt=no-new-privileges:true`
- `--network none`
- `--memory 2048m`
- `--cpus 1`
- `--user <host checkout UID:GID>` (matches whatever owns the mounted workspace, not a fixed container-image user — see below)
- `--env HOME=/workspace` (required alongside the dynamic `--user`; see below)
- workspace mounted at `/workspace`

The runtime fails closed when the sandbox runner is unavailable. There is no fallback path to host shell execution or host file writes.

## Command Model

The bash tool no longer passes raw strings to `bash -c`.

Commands are parsed into a binary and argument list. Only approved workspace binaries are accepted:

- `git`
- `npm`
- `npx`
- `node`
- `prettier`

Shell metacharacters are rejected before Docker execution. This blocks accidental shell interpretation and injection patterns.

## File Write Model

Local file writes are preflighted against the workspace boundary and protected path list before the sandbox writer runs.

The actual write is performed inside the container by a parameterized Node worker. Content is streamed over stdin, and the target path is passed as an argument. The worker revalidates the `/workspace` boundary before writing.

## What This Replaces

This is not a return to approval-ticket theater. It is a real execution boundary:

- tools still do real work by default;
- risky work is isolated from the host;
- path traversal is fail-closed;
- shell injection is rejected before execution;
- unavailable sandbox infrastructure blocks execution instead of falling back to host execution.

## Proof

The dedicated contract test is:

```bash
npx vitest run src/runtime/sandbox/sandbox-runner.spec.ts
```

The CI workflow runs this contract test before the full test suite.

## Container User Resolution

The container `--user` is resolved to the host process's UID:GID (`resolveDefaultSandboxUser()`
in `sandbox-runner.ts`), not a fixed container-image username. This was fixed after
`symbolwright preflight` (see `SYMBOLWRIGHT_RUNTIME_BUILD_STATE.md`) first ran real
`npm run build`/`npm test`/`npm run typecheck` through the sandbox in CI and hit `EACCES`
writing into the bind-mounted `/workspace` (`dist/` for build, `node_modules/.vite-temp/` for
vitest's config cache) — the previously fixed `--user node` did not match the UID that owns
the checkout on the host. Matching the host UID:GID is the standard fix for Docker bind-mount
permission mismatches and does not change `--cap-drop=ALL`, `--security-opt=no-new-privileges`,
or `--network none`. Set `SYMBOLWRIGHT_SANDBOX_USER` to override explicitly (for example to pin a
specific non-root UID:GID) if the host UID should not be trusted implicitly.

Matching an arbitrary host UID has one further consequence: that UID has no corresponding
`/etc/passwd` entry in the container image, so `os.homedir()` cannot resolve a home directory
and falls back to `/` — which a non-root UID cannot write to. Anything that writes a
home-relative path (`resolveStoragePaths()`'s global sessions/audit directories) failed with
`EACCES` under a real, non-root, unmapped UID (this only surfaced in CI, since the local
reproduction used to verify the UID fix happened to run as `root`, which can write anywhere
regardless of `os.homedir()`). The sandbox now sets `--env HOME=/workspace` explicitly so
`os.homedir()` resolves to the writable, bind-mounted workspace regardless of whether the
container recognizes the UID.
