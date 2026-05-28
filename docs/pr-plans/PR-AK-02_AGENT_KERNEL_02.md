# PR-AK-02 — AGENT-KERNEL-02 Workflow Validator

**Architectural Block:** `AGENT-KERNEL-02`  
**PR Lineage:** `PR-AK-02`  
**Phase Lineage:** `Phase-16G-AK-02`  
**Scope:** Deterministic validation for Agent Kernel planning workflows  
**Risk:** Low / Medium  

---

## Purpose

Add the second Agent Kernel block: a deterministic workflow validator for Agent Kernel planning decisions.

AGENT-KERNEL-01 introduced the planning substrate. AGENT-KERNEL-02 validates that emitted plans remain structurally safe, known, checkpointed, and planning-only before later Agent Kernel blocks can depend on them.

---

## Files Added / Changed

```txt
src/kernel/agent-kernel-workflow-validator.ts
src/kernel/agent-kernel-workflow-validator.spec.ts
src/index.ts
docs/pr-plans/PR-AK-02_AGENT_KERNEL_02.md
```

---

## Validation Coverage

The validator checks:

```txt
canonical AGENT-KERNEL-01 source lineage
non-empty workflow steps
unique step IDs
known roles
known memory scopes
known step kinds
known skills
operator checkpoints
invalid checkpoint references
patch-proposal checkpoint requirements
planning-only mutation boundary
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

- `AGENT-KERNEL-02`, `PR-AK-02`, and `Phase-16G-AK-02` are encoded as exported constants.
- CodeMind exposes a deterministic Agent Kernel workflow validator.
- AK-01 planning decisions can be validated before later execution-spine phases depend on them.
- Tests prove invalid workflows are rejected.
- Tests prove mutation-capable workflow steps are blocked.

---

## Rollback

Revert this PR to remove AGENT-KERNEL-02 while preserving AGENT-KERNEL-01, Ajna, permission, GitHub read adapter, and repo-context layers.
