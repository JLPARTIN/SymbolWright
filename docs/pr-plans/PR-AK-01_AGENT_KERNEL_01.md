# PR-AK-01 — AGENT-KERNEL-01 Planning Substrate

**Architectural Block:** `AGENT-KERNEL-01`  
**PR Lineage:** `PR-AK-01`  
**Phase Lineage:** `Phase-16G-AK-01`  
**Scope:** CodeMind-native import of the X1YA0I-A-O-S governed planning substrate  
**Risk:** Low / Medium  

---

## Purpose

Migrate the first required Agent OS planning primitives into CodeMind as a native Agent Kernel block.

This PR does not copy the entire A-O-S repository. It extracts the concepts CodeMind needs first:

- governed role profiles
- role memory scopes
- skill declarations
- workflow planning steps
- operator checkpoints
- patch-proposal planning boundaries
- source lineage notes for A-O-S provenance

---

## Source Lineage

The planning substrate is based on the A-O-S AGENT-OS-14 doctrine:

- multi-agent role layer
- governed skill registry
- workflow validation posture
- memory capsule provenance and quarantine posture
- planning-only provider-routing posture

CodeMind receives this as a standalone Agent Kernel layer, not as a runtime dependency on A-O-S.

---

## Files Added / Changed

```txt
src/kernel/agent-kernel.types.ts
src/kernel/agent-kernel-defaults.ts
src/kernel/agent-kernel-planner.ts
src/kernel/agent-kernel-planner.spec.ts
src/index.ts
docs/pr-plans/PR-AK-01_AGENT_KERNEL_01.md
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
```

Patch work is represented as proposal planning only.

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

- `AGENT-KERNEL-01`, `PR-AK-01`, and `Phase-16G-AK-01` are encoded as exported constants.
- CodeMind exposes Agent Kernel planning contracts.
- Default A-O-S-inspired roles and skills are available in CodeMind-native form.
- The deterministic planner emits role profiles, workflow steps, operator checkpoints, doctrine notes, and source lineage.
- Tests prove the block remains planning-only and mutation-free.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-01 while preserving the existing Ajna, permission, GitHub read adapter, and repo-context layers.
