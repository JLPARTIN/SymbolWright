# PR-4 — Ajna Review Cortex Contract Types

**Branch:** `pr4-ajna-review-contracts`  
**Status:** Implementation PR  
**Risk:** Low / Medium  
**Scope:** Ajna review contracts and merge-readiness guard helpers only

---

## Purpose

Add the first Ajna Review Cortex TypeScript contracts.

Ajna is CodeMind's third-eye PR review capability. This PR defines the data language for Ajna findings, evidence, risk, review responses, and merge-readiness status.

---

## Files Added / Changed

```txt
src/ajna/ajna-review.types.ts
src/ajna/ajna-merge-readiness.ts
src/ajna/ajna-merge-readiness.spec.ts
src/index.ts
docs/pr-plans/PR-4_AJNA_REVIEW_CONTRACT_TYPES.md
```

---

## Contract Doctrine

Ajna may classify and recommend, but it must not self-authorize merge.

Ajna must not claim `MERGE_READY_WITH_EVIDENCE` unless evidence gates are satisfied.

Blocked findings must prevent merge-ready status.

---

## Runtime Boundary

This PR does not add:

```txt
GitHub PR readers
GitHub PR comments
file mutation
bash execution
network ingestion
merge automation
CodeMind repair loop execution
AELIB runtime coupling
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

- Ajna contract types compile under strict TypeScript.
- Tests prove blocked statuses are recognized.
- Tests prove merge-ready cannot be declared without required evidence.
- Tests prove security and architecture blockers prevent merge-ready status.
- No runtime mutation capability is introduced.

---

## Rollback

Revert this PR to remove Ajna contracts while keeping the CodeMind TypeScript foundation and permission contracts intact.
