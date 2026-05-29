# PR-CM-TEST-02 — Proof Harness Kernel Trace Replay Validation

## Block

- Architectural Block: `CODEMIND-PROOF-HARNESS-02`
- PR: `PR-CM-TEST-02`
- Phase: `CODEMIND-TEST-02`

## Purpose

Extends the CodeMind Proof Harness so kernel trace replay can be evaluated as deterministic proof evidence.

This connects the Proof Harness foundation to AK-07 trace replay and gives Ajna a formal way to reason about whether the Agent Kernel spine has enough replay evidence to support merge-readiness claims.

## Doctrine

PR-CM-TEST-02 remains backend-only, deterministic, read-only, and analysis-only.

It does not add provider invocation, command execution, repo mutation, GitHub write behavior, merge automation, runtime actuation, automatic skill promotion, or live agent execution.

## Files added

```txt
src/testing/codemind-kernel-trace-proof.ts
src/testing/codemind-kernel-trace-proof.spec.ts
docs/pr-plans/PR-CM-TEST-02_KERNEL_TRACE_REPLAY_VALIDATION.md
```

## Files updated

```txt
src/index.ts
```

## What this adds

- kernel trace proof contract
- AK replay proof status model
- missing-kernel-stage detection
- replay invalidation when lineage, metadata, or invariants fail
- blocking-note support
- deterministic Vitest coverage
- public exports through `src/index.ts`

## Required invariants

Every proof report preserves:

```txt
providerInvocationAllowed === false
repoMutationAllowed === false
commandExecutionAllowed === false
```

## Validation states

```txt
TRACE_PROOF_READY
TRACE_PROOF_PARTIAL
TRACE_PROOF_BLOCKED
TRACE_PROOF_INVALID
```

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Roadmap meaning

After this PR, Ajna can say not only that a subsystem has tests, but also that kernel trace replay evidence is present, deterministic, and safe under non-execution invariants.
