# CodeMind Runtime Foundation

This document describes the first CodeMind runtime foundation layer.

The runtime foundation exists to give CodeMind a typed place to grow from command placeholders into governed agent behavior without weakening the current safety posture.

## Current PR Scope

This PR adds only the non-executing foundation:

```txt
src/runtime/types.ts
src/runtime/policy/runtime-policy.ts
src/runtime/registry/runtime-registry.ts
```

It also adds unit coverage for the default policy and registry behavior.

## Safety Posture

The default runtime policy is intentionally conservative:

```txt
mode: READ_ONLY
allowNetwork: false
allowShell: false
allowWrites: false
```

The runtime blocks:

```txt
network ingestion
shell execution
file writes
path traversal outside the workspace
protected path access such as .git, .env, node_modules, dist, and coverage
```

The policy accepts approval-shaped data as a type, but approval data does not bypass disabled writes. A future policy must explicitly enable approved execution before any write-capable tool can proceed.

## Registry Role

The runtime registry is a typed catalog for future CodeMind runtime entries. It does not execute work by itself. It only stores runtime entry definitions, rejects duplicate names, and gives callers a predictable way to retrieve registered entries.

Future PRs can add read-only entries for:

```txt
plan_goal
list_files
read_file
search_files
validation_plan
```

Proposal-only and approved execution entries should remain separate later phases.

## Out of Scope

This PR does not activate:

```txt
codemind plan
codemind read
codemind search
codemind propose-patch
codemind validation-plan
bounded agent loops
Ajna runtime critique
file edits
bash execution
network adapters
GitHub writes
PR comments
```

Those features should land in later PRs behind the same runtime policy model.
