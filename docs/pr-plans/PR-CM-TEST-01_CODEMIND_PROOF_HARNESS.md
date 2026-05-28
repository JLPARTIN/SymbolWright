# PR-CM-TEST-01 — CodeMind Proof Harness

## Block

- Architectural Block: `CODEMIND-PROOF-HARNESS-01`
- PR: `PR-CM-TEST-01`
- Phase: `CODEMIND-TEST-01`

## Purpose

Adds a deterministic proof-harness contract for CodeMind so test coverage can be modeled as a first-class backend artifact instead of only an implicit CI command.

This locks Vitest into the CodeMind roadmap as the proof layer behind Ajna, repo intelligence, GitHub adapters, permission policy, runtime boundaries, and the Agent Kernel.

## Doctrine

The proof harness is read-only and analysis-only.

It does not execute providers, mutate repositories, post GitHub comments, merge PRs, run shell commands, or promote agent behavior.

## What this adds

- canonical proof harness block metadata
- proof domains for CodeMind subsystem coverage
- deterministic domain state classification
- missing-spec reporting
- blocking-note reporting
- merge-readiness summary based on proof-domain coverage
- Vitest coverage for the proof-harness contract
- public exports through `src/index.ts`

## Proof domains

```txt
FOUNDATION
AJNA_REVIEW_CORTEX
REPO_CONTEXT
GITHUB_ADAPTERS
PERMISSIONS
AGENT_KERNEL
RUNTIME_BOUNDARY
```

## Domain states

```txt
COVERED
PARTIAL
MISSING
BLOCKED
```

## Runtime boundary

This PR does not add:

- provider invocation
- command execution
- file mutation tools
- GitHub mutation adapters
- PR comment posting
- merge automation
- persistent memory writes
- automatic skill promotion
- new planning behavior
- new route execution behavior

## Validation

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Roadmap meaning

This PR establishes the `CodeMind Proof Harness — powered by Vitest` as the testing intelligence foundation.

Ajna can later consume this contract to explain whether a PR is actually safe to merge based on test evidence, missing proof domains, and blocked validation areas.
