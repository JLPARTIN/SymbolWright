# CodeMind Secure Sandbox Runner

CodeMind is execution-first, but workspace mutation and command execution must not run directly against the host process.

This runner layer keeps the Claude Code-style operator experience while routing risky tool surfaces through a bounded container boundary.

## Architecture

```text
Host CodeMind Orchestrator
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
- `--memory 512m`
- `--cpus 1`
- `--user node`
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
