# CodeMind Next-Arc Analysis Report

## Scope

This document is the read-only planning artifact for `PR-CM-NEXTARC-00`.

No runtime code, package files, CI files, or source modules are changed by this planning block.

## Repository State Confirmed

- Repository: `JLPARTIN/JLPARTIN-CodeMind`
- Default branch: `main`
- Package name: `codemind`
- Module type: ESM
- TypeScript build script: `tsc -p tsconfig.json`
- Test runner: Vitest

## Existing Agent Kernel Arc

The existing Agent Kernel arc is treated as locked through AK-07:

```txt
AK-01 Planning Substrate
AK-02 Workflow Validator
AK-03 Skill Registry + Skill Validator
AK-04 Context Packet Builder
AK-05 Provider Routing Gateway
AK-06 Route Execution Preflight
AK-07 Deterministic Trace Replay
```

## Existing Proof Harness Arc

The CodeMind Proof Harness arc has already landed through TEST-10:

```txt
PR-CM-TEST-01  Proof Harness Foundation
PR-CM-TEST-01B Docs and barrel exports
PR-CM-TEST-02  Kernel Trace Proof Validation
PR-CM-TEST-03  Ajna Proof Matrix
PR-CM-TEST-04  Repo Context Proof
PR-CM-TEST-05  Governance Proof
PR-CM-TEST-06  Runtime Boundary Proof
PR-CM-TEST-07  GitHub Adapter Proof
PR-CM-TEST-08  Proof Report Renderer
PR-CM-TEST-09  v8 Coverage Thresholds
PR-CM-TEST-10  Ajna Proof Gate
```

Status: `EXISTS_VERIFIED`.

## Locked Invariants

All next-arc PRs must preserve:

```txt
providerInvoked === false
repoMutationAllowed === false
commandExecutionAllowed === false
```

Expanded runtime boundary expectations:

```txt
providerInvocationAllowed === false
repoMutationAllowed === false
githubWriteAllowed === false
commandExecutionAllowed === false
mergeAutomationAllowed === false
persistentMemoryWriteAllowed === false
automaticSkillPromotionAllowed === false
```

## Vitest Audit

### package.json

Verified scripts include:

```txt
build: tsc -p tsconfig.json
test: vitest run
test:watch: vitest
test:coverage: vitest run --coverage
typecheck: tsc -p tsconfig.json --noEmit
```

### vitest.config.ts

Verified settings:

```txt
include: src/**/*.spec.ts
coverage provider: v8
coverage reporters: text, json, html
coverage thresholds: statements 80, branches 75, functions 80, lines 80
```

### CI

Verified `.github/workflows/ci.yml` has:

```txt
pull_request validation
main push validation
concurrency group
cancel-in-progress: true
```

Cancelled main-branch runs after rapid merges are expected behavior from concurrency and are not PR branch failures.

## Capability Gap Summary

The Proof Harness is now strong enough to support the next arc: Ajna operational review intelligence.

The next major gap is not more proof infrastructure. The next gap is an operational Ajna pipeline that consumes the proof harness and produces deterministic review sessions, risk synthesis, merge decisions, and operator-readable reports.

## Recommended Next Arc

```txt
CODEMIND-AJNA-REVIEW-INTELLIGENCE-01
```

This arc should remain backend-only, deterministic, read-only, and analysis-only.
