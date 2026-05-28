# PR-3 — CodeMind Permission Contracts + CI Workflow

**Branch:** `pr3-codemind-contracts`  
**Status:** Implementation PR  
**Risk:** Low / Medium  
**Scope:** Permission contracts and deterministic policy foundation only

---

## Purpose

Add the first CodeMind permission contract layer and the missing GitHub Actions CI workflow.

This PR defines the core permission language future CodeMind and Ajna runtime work must obey before any write-capable tools are introduced.

---

## Files Added / Changed

```txt
.github/workflows/ci.yml
src/permissions/codemind-permission.types.ts
src/permissions/codemind-permission-policy.ts
src/permissions/codemind-permission-policy.spec.ts
src/index.ts
docs/pr-plans/PR-3_CODEMIND_PERMISSION_CONTRACTS.md
```

---

## Permission Doctrine

CodeMind permission resolution follows:

```txt
DENY > ASK > ALLOW
```

Default behavior remains approval-gated.

Protected targets are classified before action approval.

---

## Runtime Boundary

This PR does not add:

```txt
file write tools
bash execution tools
GitHub mutation adapters
network ingestion
PR comment posting
merge behavior
AELIB runtime coupling
```

The evaluator is deterministic contract logic only.

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

- CI workflow appears in GitHub Actions.
- Permission contracts compile under strict TypeScript.
- Tests prove DENY overrides ASK and ALLOW.
- Tests prove protected targets are blocked or escalated.
- No runtime mutation capability is introduced.

---

## Rollback

Revert this PR to remove the permission contract layer and CI workflow while keeping the PR-2 TypeScript foundation intact.
