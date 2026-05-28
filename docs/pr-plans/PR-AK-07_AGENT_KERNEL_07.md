# PR-AK-07 — AGENT-KERNEL-07 Deterministic Trace Replay

**Architectural Block:** `AGENT-KERNEL-07`  
**PR Lineage:** `PR-AK-07`  
**Phase Lineage:** `Phase-16G-AK-07`  
**Scope:** Deterministic trace replay for AGENT-KERNEL-01 through AGENT-KERNEL-06  
**Risk:** Low  

---

## Purpose

Add the seventh Agent Kernel block: a deterministic trace replay organ for the existing kernel spine.

AGENT-KERNEL-07 is a forensic lens. It captures and validates replayable trace frames from AGENT-KERNEL-01 through AGENT-KERNEL-06. It does not create a new planning surface, routing surface, or execution surface.

---

## Important Doctrine

AGENT-KERNEL-07 performs read-only replay analysis only.

```txt
Capture trace frames: yes
Validate AK-01..AK-06 lineage: yes
Validate block/PR/phase IDs: yes
Validate non-execution invariants: yes
Aggregate warnings: yes
Emit deterministic replay report: yes
Invoke providers: no
Mutate repository: no
Execute commands: no
Create new route plans: no
Perform execution spine behavior: no
```

Every replay report preserves the governance interpretation of the existing chain:

```txt
providerInvoked=false
repoMutationAllowed=false
commandExecutionAllowed=false
```

---

## Files Added / Changed

```txt
src/kernel/agent-kernel-trace.types.ts
src/kernel/agent-kernel-trace-replay.service.ts
src/kernel/agent-kernel-trace-replay.spec.ts
src/index.ts
docs/pr-plans/PR-AK-07_AGENT_KERNEL_07.md
```

---

## Replay Validation

The replay service validates:

```txt
executionId filtering
AK-01 -> AK-06 lineage order
block ID validity
PR ID validity
Phase ID validity
ISO timestamp shape
providerInvoked invariant
repoMutationAllowed invariant
commandExecutionAllowed invariant
warning aggregation
summary frame counts
first and last block IDs
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
new planning behavior
new routing behavior
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

- `AGENT-KERNEL-07`, `PR-AK-07`, and `Phase-16G-AK-07` are encoded as exported constants.
- CodeMind exposes deterministic trace replay contracts.
- CodeMind exposes `AgentKernelTraceReplayService`.
- Valid AK-01 through AK-06 chains replay cleanly.
- Out-of-order blocks fail lineage validation.
- Bad PR/phase/timestamp metadata fails block validation.
- Any invariant flip fails invariant validation.
- Warnings are aggregated with block lineage labels.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-07 while preserving AGENT-KERNEL-01 through AGENT-KERNEL-06, Ajna, permission, GitHub read adapter, and repo-context layers.
