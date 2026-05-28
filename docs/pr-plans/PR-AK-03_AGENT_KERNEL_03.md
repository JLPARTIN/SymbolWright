# PR-AK-03 — AGENT-KERNEL-03 Skill Registry + Skill Validator

**Architectural Block:** `AGENT-KERNEL-03`  
**PR Lineage:** `PR-AK-03`  
**Phase Lineage:** `Phase-16G-AK-03`  
**Scope:** Governed skill registry, active-use validator, and skill proposal path  
**Risk:** Low / Medium  

---

## Purpose

Add the third Agent Kernel block: a deterministic skill registry and skill validator.

AGENT-KERNEL-01 introduced planning decisions. AGENT-KERNEL-02 validates workflow structure. AGENT-KERNEL-03 validates that active skill use is registry-bound, risk-bounded, tool-category-safe, output-type-declared, and approval-aware.

---

## Important Doctrine

Strict unknown-skill rejection applies to **active skill use**, not to learning.

```txt
Unknown skill in active plan: reject
New skill proposal: allow as governed proposal / review object
Registered skill: validate and allow only if policy passes
```

This allows CodeMind to grow new skills without hallucinating undeclared capabilities into live plans.

---

## Files Added / Changed

```txt
src/kernel/agent-kernel-skill-registry.ts
src/kernel/agent-kernel-skill-validator.ts
src/kernel/agent-kernel-skill-registry.spec.ts
src/index.ts
docs/pr-plans/PR-AK-03_AGENT_KERNEL_03.md
```

---

## Registry Capabilities

```txt
registry snapshot
skill lookup
skill risk ranking
skill proposal creation
skill proposal review
quarantine of incomplete/high-risk proposals
```

---

## Active Skill Validation

The validator checks:

```txt
unknown skill rejection
allowed tool categories
blocked tool categories
declared output types
risk ceiling enforcement
operator approval requirements
valid registered skill use
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

- `AGENT-KERNEL-03`, `PR-AK-03`, and `Phase-16G-AK-03` are encoded as exported constants.
- CodeMind exposes deterministic skill registry APIs.
- Unknown skills are rejected for active use.
- New skills can be proposed through a governed proposal path.
- Tests prove valid skills pass, unsafe/unknown skill use is rejected, and proposals remain non-active until reviewed/merged.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-03 while preserving AGENT-KERNEL-01, AGENT-KERNEL-02, Ajna, permission, GitHub read adapter, and repo-context layers.
