# PR-CM-TEST-02: Kernel Trace Proof Validation

## Canonical lineage

```
CODEMIND-PROOF-HARNESS-02
PR-CM-TEST-02
CODEMIND-TEST-02
```

## Purpose

Connect the CodeMind Proof Harness to AK-07 trace replay evidence. Validates that Agent Kernel blocks AK-01 through AK-06 have correct lineage, metadata, and non-execution invariants before declaring proof coverage.

## Validation statuses

```
TRACE_PROOF_READY    — all required blocks have valid replay evidence
TRACE_PROOF_PARTIAL  — some required blocks are covered
TRACE_PROOF_BLOCKED  — blocking notes present
TRACE_PROOF_INVALID  — replay validation failed (lineage, metadata, or invariant errors)
```

## Required kernel evidence

AK-07 supports replay evidence for:

```
AGENT-KERNEL-01
AGENT-KERNEL-02
AGENT-KERNEL-03
AGENT-KERNEL-04
AGENT-KERNEL-05
AGENT-KERNEL-06
```

AK-07 itself acts as the replay organ.

## Required invariants (must hold in every trace frame)

```
providerInvoked === false
repoMutationAllowed === false
commandExecutionAllowed === false
```

## Core exports

```ts
CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID
CODEMIND_KERNEL_TRACE_PROOF_PR_ID
CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID
CODEMIND_KERNEL_TRACE_PROOF_STATUSES
buildCodemindKernelTraceProofReport
```

## Files

- `src/testing/codemind-kernel-trace-proof.ts`
- `src/testing/codemind-kernel-trace-proof.spec.ts`
- `src/index.ts` (barrel exports added in PR-CM-TEST-02B)
- `docs/pr-plans/PR-CM-TEST-02_KERNEL_TRACE_REPLAY_VALIDATION.md`

## Dependencies

- `src/kernel/agent-kernel-trace.types.ts` — trace frame contracts (from PR-AK-07)
- `src/kernel/agent-kernel-trace-replay.service.ts` — replay validation service (from PR-AK-07)

## Runtime boundary

Backend-only, deterministic, read-only, analysis-only.

No provider invocation, shell execution, file mutation, GitHub mutation adapters, PR comment posting, merge automation, persistent memory writes, automatic skill promotion, new planning behavior, or new route execution behavior.

## Vitest coverage

- canonical metadata
- non-execution invariants all false
- TRACE_PROOF_READY
- TRACE_PROOF_PARTIAL
- TRACE_PROOF_BLOCKED
- TRACE_PROOF_INVALID (lineage error)
- TRACE_PROOF_INVALID (invariant violation)
- executionId frame filtering (partial, not invalid)
- deterministic summary

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Note on stacked PR history

PR #23 on GitHub merged into the stacked branch `pr-cm-test-01-proof-harness` rather than `main`. This PR recovers those files onto main directly.
