# PR-AK-06 — AGENT-KERNEL-06 Route Execution Preflight

**Architectural Block:** `AGENT-KERNEL-06`  
**PR Lineage:** `PR-AK-06`  
**Phase Lineage:** `Phase-16G-AK-06`  
**Scope:** Deterministic route execution preflight gate for AK-05 route plans  
**Risk:** Low / Medium  

---

## Purpose

Add the sixth Agent Kernel block: a deterministic Route Execution Preflight gate.

AGENT-KERNEL-05 recommends provider routes without invoking providers. AGENT-KERNEL-06 evaluates those route plans against execution policy and emits a readiness decision while preserving non-execution boundaries.

---

## Important Doctrine

AGENT-KERNEL-06 authorizes readiness state only.

```txt
Accept AK-05 route plan: yes
Validate route readiness: yes
Validate route type policy: yes
Require approval for external routes: yes
Emit execution-preflight decision: yes
Invoke provider: no
Mutate repository: no
Execute commands: no
```

Every preflight decision preserves:

```txt
providerInvoked=false
repoMutationAllowed=false
commandExecutionAllowed=false
```

---

## Files Added / Changed

```txt
src/kernel/agent-kernel-route-execution-preflight.ts
src/kernel/agent-kernel-route-execution-preflight.spec.ts
src/index.ts
docs/pr-plans/PR-AK-06_AGENT_KERNEL_06.md
```

---

## Preflight Checks

```txt
providerRouteReady flag
providerInvoked invariant
allowed route types
NO_ROUTE blocking
route warning blocking
external route policy
operator approval for external routes
```

---

## Runtime Boundary

This PR is backend-only and deterministic.

It does not add:

```txt
provider invocation
shell command execution
file mutation tools
GitHub mutation adapters
PR comment posting
merge automation
live sub-agent spawning
persistent memory writes
automatic skill promotion
execution spine behavior
```

---

## Validation Commands

```bash
npm install
npm run typecheck
npm test
npm run build
```

---

## Expected Result

- `AGENT-KERNEL-06`, `PR-AK-06`, and `Phase-16G-AK-06` are encoded as exported constants.
- CodeMind exposes a deterministic route execution preflight gate.
- Ready local routes can pass preflight.
- NO_ROUTE, not-ready routes, unapproved external routes, blocked route types, and warning-heavy route plans are rejected.
- Tests prove all preflight decisions preserve non-execution invariants.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-06 while preserving AGENT-KERNEL-01 through AGENT-KERNEL-05, Ajna, permission, GitHub read adapter, and repo-context layers.
