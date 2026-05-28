# PR-7 — Read-Only GitHub PR Context Adapter Contracts

**Branch:** `pr7-github-pr-context-contracts`  
**Status:** Implementation PR  
**Risk:** Low / Medium  
**Scope:** Read-only GitHub PR context adapter contracts only

---

## Purpose

Define the input/output contract for a future GitHub pull-request context adapter.

This PR creates the contract layer that will later allow CodeMind and Ajna to receive GitHub PR metadata, changed files, diff summaries, CI evidence, and test evidence as read-only repository context.

---

## Files Added / Changed

```txt
src/github/github-pr-context.types.ts
src/github/github-pr-context-contract.ts
src/github/github-pr-context-contract.spec.ts
src/index.ts
docs/pr-plans/PR-7_GITHUB_PR_CONTEXT_ADAPTER_CONTRACTS.md
```

---

## Contract Doctrine

The GitHub PR context adapter contract is explicitly read-only.

It can describe what a future adapter may provide.

It cannot perform GitHub API reads or writes yet.

It cannot post comments, approve PRs, request changes, merge PRs, push commits, mutate labels, or execute network runtime behavior.

---

## Runtime Boundary

This PR does not add:

```txt
live GitHub adapter runtime
GitHub API calls
GitHub PR comments
GitHub approvals
GitHub merge actions
file mutation
bash execution
network runtime
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

- GitHub PR context contracts compile under strict TypeScript.
- Tests prove all write paths remain disabled.
- Tests prove read-only assertion fails if a write path is enabled.
- Tests prove pull-request identity is preserved in contract output.
- No runtime GitHub API behavior is introduced.

---

## Rollback

Revert this PR to remove GitHub PR adapter contracts while keeping CodeMind foundation, permission contracts, Ajna contracts, repo context model, and renderer intact.
