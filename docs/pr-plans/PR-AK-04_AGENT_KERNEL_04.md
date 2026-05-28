# PR-AK-04 — AGENT-KERNEL-04 Context Packet Builder

**Architectural Block:** `AGENT-KERNEL-04`  
**PR Lineage:** `PR-AK-04`  
**Phase Lineage:** `Phase-16G-AK-04`  
**Scope:** Deterministic context packet builder for validated Agent Kernel planning state  
**Risk:** Low / Medium  

---

## Purpose

Add the fourth Agent Kernel block: a deterministic Context Packet Builder.

AGENT-KERNEL-01 creates planning decisions. AGENT-KERNEL-02 validates workflow structure. AGENT-KERNEL-03 validates skill use and governs skill proposals. AGENT-KERNEL-04 packages validated planning state into a provider-ready packet without invoking any provider.

---

## Important Doctrine

AGENT-KERNEL-04 builds context packets only.

```txt
Provider-ready: yes, when upstream planning/workflow/skill validation passes
Provider-invoking: no
Execution-capable: no
Mutation-capable: no
```

A context packet is an inert data object that downstream runtime blocks may inspect later. It does not call external systems.

---

## Files Added / Changed

```txt
src/kernel/agent-kernel-context-packet.ts
src/kernel/agent-kernel-context-packet.spec.ts
src/index.ts
docs/pr-plans/PR-AK-04_AGENT_KERNEL_04.md
```

---

## Context Packet Sections

```txt
operator-intent
repo-reference
roles
skills
workflow-validation
skill-validation
source-lineage
doctrine-notes
```

---

## Builder Guarantees

The builder provides:

```txt
canonical AGENT-KERNEL-04 lineage
providerReady flag
providerInvoked=false invariant
repo context references
selected role summary
selected skill summary
workflow validation summary
skill validation summary
source lineage packing
doctrine note packing
section boundary limits
source lineage item limits
warnings when upstream state is not provider-ready
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

- `AGENT-KERNEL-04`, `PR-AK-04`, and `Phase-16G-AK-04` are encoded as exported constants.
- CodeMind exposes a deterministic context packet builder.
- Packets can be marked provider-ready without invoking providers.
- Invalid planning, workflow, or skill validation states produce warnings and providerReady=false.
- Tests prove packet boundaries and non-invocation behavior.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-04 while preserving AGENT-KERNEL-01, AGENT-KERNEL-02, AGENT-KERNEL-03, Ajna, permission, GitHub read adapter, and repo-context layers.
