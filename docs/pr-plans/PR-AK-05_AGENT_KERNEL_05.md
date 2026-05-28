# PR-AK-05 — AGENT-KERNEL-05 Provider Routing Gateway

**Architectural Block:** `AGENT-KERNEL-05`  
**PR Lineage:** `PR-AK-05`  
**Phase Lineage:** `Phase-16G-AK-05`  
**Scope:** Deterministic provider route planning for AK-04 context packets  
**Risk:** Low / Medium  

---

## Purpose

Add the fifth Agent Kernel block: a deterministic Provider Routing Gateway.

AGENT-KERNEL-04 packages validated planning state into inert context packets. AGENT-KERNEL-05 evaluates those packets against routing policy and emits a route recommendation without invoking any provider.

---

## Important Doctrine

AGENT-KERNEL-05 plans provider routing only.

```txt
Accept AK-04 context packet: yes
Validate provider readiness: yes
Recommend route type: yes
Select route label: yes
Invoke provider: no
Mutate repository: no
Execute commands: no
```

The gateway preserves `providerInvoked=false` in every route plan.

---

## Files Added / Changed

```txt
src/kernel/agent-kernel-provider-routing-gateway.ts
src/kernel/agent-kernel-provider-routing-gateway.spec.ts
src/index.ts
docs/pr-plans/PR-AK-05_AGENT_KERNEL_05.md
```

---

## Route Types

```txt
NO_ROUTE
LOCAL_ONLY
LIGHTWEIGHT_REASONING
DEEP_REASONING
AUDIT_REVIEW
```

---

## Gateway Checks

```txt
packet providerReady flag
providerInvoked invariant
packet warning ceiling
workflow validation section requirement
skill validation section requirement
route selection
local-only policy
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

- `AGENT-KERNEL-05`, `PR-AK-05`, and `Phase-16G-AK-05` are encoded as exported constants.
- CodeMind exposes a deterministic provider routing gateway.
- Ready context packets receive route recommendations.
- Invalid or incomplete packets receive `NO_ROUTE`.
- Route plans preserve `providerInvoked=false`.
- Tests prove route blocking, local-only routing, section requirements, warnings, and non-invocation behavior.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-05 while preserving AGENT-KERNEL-01 through AGENT-KERNEL-04, Ajna, permission, GitHub read adapter, and repo-context layers.
