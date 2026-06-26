# CodeMind Build Ledger

The build ledger is the single source of truth for CodeMind runtime build state. It derives its data directly from `RUNTIME_BUILD_PHASES` in `src/runtime/runtime-build-state.ts` and provides consistency checks against README.md and runtime docs.

## Source of truth

The canonical phase definitions live in:

```text
src/runtime/runtime-build-state.ts → RUNTIME_BUILD_PHASES
```

The build ledger reads from this array and produces:

- A typed ledger summary with phase counts, completion state, and per-phase metadata
- A consistency checker that compares README.md and docs against the runtime source
- Rendered text output for CLI and operator consumption

## Consistency checks

The ledger can detect:

- README claiming a different completed phase count than the runtime
- Runtime docs missing a completed phase
- Runtime docs claiming a next phase when all phases are complete
- README not mentioning the completed phase count at all

## CLI access

```text
codemind project-context [dir]
```

The project context command includes the build ledger summary in its output.

## Implementation

```text
src/build-state/codemind-build-ledger.ts      — ledger types, builder, consistency checker, renderers
src/build-state/codemind-build-ledger.spec.ts  — unit tests
```

## Safety posture

The build ledger is read-only. It does not modify any files, execute shell commands, or make network calls. It reads the in-memory `RUNTIME_BUILD_PHASES` constant and optionally checks file content strings passed to it.
