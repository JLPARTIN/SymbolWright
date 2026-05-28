# PR-5 — Read-Only Repo Context Model

**Branch:** `pr5-read-only-repo-context-model`  
**Status:** Implementation PR  
**Risk:** Low / Medium  
**Scope:** Read-only repository context contracts and summary helpers only

---

## Purpose

Add the read-only repository context model that CodeMind and Ajna need before real repository scanners, GitHub adapters, PR review renderers, or repair loops are introduced.

This PR defines contract objects for repository identity, refs, changed files, diff hunks, CI evidence, and test evidence.

---

## Files Added / Changed

```txt
src/repo-context/repo-context.types.ts
src/repo-context/repo-context-summary.ts
src/repo-context/repo-context-summary.spec.ts
src/index.ts
docs/pr-plans/PR-5_READ_ONLY_REPO_CONTEXT_MODEL.md
```

---

## Contract Doctrine

The context model is explicitly read-only.

It can describe repository state, changed files, diff summaries, CI evidence, and test evidence.

It cannot mutate files, run commands, post PR comments, fetch network resources, or create GitHub side effects.

---

## Runtime Boundary

This PR does not add:

```txt
repo scanner runtime
GitHub reader adapter
GitHub writer adapter
file mutation
bash execution
network ingestion
PR comment posting
merge automation
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

- Repo context contracts compile under strict TypeScript.
- Tests prove protected changed files are counted.
- Tests prove highest impact level is derived deterministically.
- Tests prove evidence state satisfaction is explicit.
- Summary output preserves `readOnly: true`.
- No runtime mutation capability is introduced.

---

## Rollback

Revert this PR to remove the read-only repo context model while keeping CodeMind foundation, permission contracts, and Ajna contracts intact.
