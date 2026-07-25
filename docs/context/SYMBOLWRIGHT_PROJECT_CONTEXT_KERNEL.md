# SymbolWright Project Context Kernel

The project context kernel makes SymbolWright repo-aware by loading project instructions, build state, package scripts, workflows, and documentation into a deterministic context packet.

## Purpose

Before SymbolWright can plan work, generate mission packets, or hand off to other agents, it needs a reliable snapshot of the repository's configuration and instructions. The project context kernel produces this snapshot.

## CLI command

```text
symbolwright project-context [dir]
```

When `dir` is omitted, defaults to the current working directory.

## Context packet contents

The context packet includes:

### Instructions
Detects and summarizes standard project instruction files:
- `README.md`
- `SYMBOLWRIGHT.md`
- `CLAUDE.md`
- `AGENTS.md`
- `.github/copilot-instructions.md`

For each file: existence, line count, and first heading as summary.

### Build state
Current build ledger summary from `RUNTIME_BUILD_PHASES`:
- Total phases
- Completed phases
- Next phase (if any)

### Package scripts
All scripts from `package.json`, with validation-relevant scripts identified.

### Workflows
Checks for known CI/CD workflow files under `.github/workflows/`.

### Docs present
Scans `docs/roadmap` and `docs/pr-plans` for markdown files.

### Operator directives
Default operator directives enforced by SymbolWright:
- Plan-first by default
- Read-only before writes
- Approval ticket required for mutations
- Protected paths always blocked

### Risk boundaries
Default risk boundaries:
- No auto-merge
- No auto-approve
- No force push
- No unbounded shell
- No secret access
- No silent background execution

### Validation commands
Validation-relevant npm scripts extracted from `package.json`.

## Safety posture

The project context kernel is fully local and read-only:
- Does not modify files
- Does not execute commands
- Does not make network calls
- Redacts secrets found in instruction files
- Does not read protected paths (`.env`, `.env.local`, `node_modules`, `.git`, `dist`, `coverage`)

## Implementation

```text
src/context/project-instructions.ts          — instruction types and builders
src/context/project-instructions-loader.ts   — file system loader with redaction
src/context/project-context-kernel.ts        — kernel types, builder, renderer
src/context/project-context-kernel.spec.ts   — unit tests
src/cli-project-context.ts                   — CLI command handler
fixtures/project-context-fixture.json        — test fixture
```
