# CodeMind Next-Arc Vitest Test Intelligence Plan

## Doctrine

CodeMind does not trust untested intelligence.

Every module must prove:

```txt
contract correctness
invariant preservation
blocked-state behavior
invalid-state behavior
deterministic output
safe runtime boundaries
```

Ajna may not declare merge-readiness unless the Proof Harness can explain why.

## Current Vitest State

Status: `EXISTS_VERIFIED`

```txt
Vitest installed
Vitest run script present
Vitest watch script present
Coverage script present
v8 coverage provider present
Coverage thresholds present
CI pull_request trigger present
CI main push trigger present
CI concurrency present
```

## Existing Test Arc

The Proof Harness suite now includes coverage for:

```txt
Proof Harness Foundation
Kernel Trace Proof
Ajna Proof Matrix
Repo Context Proof
Governance Proof
Runtime Boundary Proof
GitHub Adapter Proof
Proof Report Renderer
Coverage Thresholds
Ajna Proof Gate
```

## Next-Arc Required Test Suites

### TEST-AJNA-01 — Review Session Contract

- Validate PR identity.
- Validate required repository, PR number, head SHA, base SHA.
- Validate runtime mutation flags remain false.
- Validate deterministic block/pr/phase IDs.

### TEST-AJNA-02 — Proof Bundle Aggregator

- Validate all-ready proof bundle.
- Validate missing proof domains.
- Validate blocked proof domains.
- Validate invalid proof domains.
- Validate deterministic domain ordering.

### TEST-AJNA-03 — Risk Synthesis

- Validate LOW, MODERATE, HIGH, CRITICAL, BLOCKED.
- Validate protected-path escalation.
- Validate governance/runtime invalidation.
- Validate deterministic explanations.

### TEST-AJNA-04 — Merge Decision

- Validate MERGE_READY only when all gates pass.
- Validate NOT_READY for partial proof.
- Validate BLOCKED for blocked or invalid proof.
- Validate NEEDS_OPERATOR_REVIEW for high-risk human-review cases.

### TEST-AJNA-05 — Review Report Composer

- Validate plain, markdown, and compact output.
- Validate deterministic section order.
- Validate no timestamps unless explicitly supplied.
- Validate blocked and merge-ready report forms.

### TEST-AJNA-06 — Pipeline Orchestrator

- Validate ready path.
- Validate blocked path.
- Validate operator-review path.
- Validate no input mutation.
- Validate non-execution flags.

### TEST-AJNA-07 — Operator Summary

- Validate summary status.
- Validate highest-priority action selection.
- Validate blocked governance and blocked runtime boundary summaries.

### TEST-AJNA-08 — Snapshot Fixtures

- Validate fixtures are deterministic.
- Validate each fixture matches its expected pipeline result.

### TEST-AJNA-09 — Golden Reports

- Validate stable markdown snapshots.
- Validate stable plain text snapshots.
- Validate stable compact snapshots.

### TEST-AJNA-10 — Developer Guide

- Documentation-only PR. Existing CI should remain green.

## Domain Suites

Future CI can split tests into:

```txt
test:kernel
test:ajna
test:proof
test:repo
test:governance
test:github
test:runtime
test:coverage
```

Do not implement sharding until a later dedicated PR.

## Benchmark Candidates

Future benchmark coverage may include:

```txt
trace replay speed
proof report rendering speed
Ajna merge-decision speed
repo context summarization speed
review pipeline composition speed
```

Do not implement benchmarks until the Ajna Review Intelligence arc lands.
