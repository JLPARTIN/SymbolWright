# CodeMind - Ajna Build Plan

**Capability:** Ajna Review Cortex  
**Internal label:** `CODEMIND_AJNA_REVIEW_CORTEX`  
**Primary tagline:** See beyond the code.  
**PR subtitle:** Expand your vision beyond the diff.  
**Purpose:** Build Ajna as CodeMind's deep PR analysis and merge-readiness feature.

---

## 1. Build Goal

Ajna should become the CodeMind capability that reviews pull requests with deeper context than a normal diff review.

It should answer:

```txt
What changed?
What hidden systems could be affected?
What tests prove this is safe?
What risks remain?
Is this ready to merge?
What should CodeMind fix next?
```

---

## 2. PR-1 Scope

PR-1 should be foundation-only.

Files:

```txt
README.md
docs/migration/AELIB_CODEMIND_EXTRACTION_NOTES.md
docs/roadmap/CODEMIND_PLATFORM_ROADMAP.md
docs/governance/CODEMIND_PERMISSION_MODEL.md
docs/governance/CODEMIND_THREAT_MODEL.md
docs/cli/CODEMIND_CLI_TERMINAL_UX_PLAN.md
docs/ajna/CODEMIND_AJNA_ROADMAP.md
docs/ajna/CODEMIND_AJNA_BUILD_PLAN.md
```

No runtime execution should be added in PR-1.

---

## 3. PR-2 Scope — Ajna Contracts

Add TypeScript contracts only:

```txt
packages/ajna-review-cortex/package.json
packages/ajna-review-cortex/src/index.ts
packages/ajna-review-cortex/src/ajna-review.types.ts
packages/ajna-review-cortex/src/ajna-risk.types.ts
packages/ajna-review-cortex/src/ajna-merge-readiness.types.ts
packages/ajna-review-cortex/src/ajna-review-contract.spec.ts
```

No GitHub API mutation.
No file writes.
No PR comments.

---

## 4. PR-3 Scope — Read-Only PR Context Model

Add read-only abstractions for:

```txt
repository metadata
branch metadata
changed files
diff chunks
CI status summary
test evidence summary
risk-sensitive paths
```

Output should be local data objects only.

---

## 5. PR-4 Scope — Risk Classifier

Add deterministic risk classification:

```txt
LOW
MEDIUM
HIGH
CRITICAL
BLOCKED
```

Risk inputs:

```txt
files changed
protected paths
workflow changes
auth/security files
database migrations
package/dependency changes
test coverage evidence
architecture boundary changes
```

---

## 6. PR-5 Scope — Merge-Readiness Engine

Add merge-readiness statuses:

```txt
READY_TO_REVIEW
NEEDS_TEST_EVIDENCE
NEEDS_OPERATOR_DECISION
BLOCKED_BY_RISK
BLOCKED_BY_CI
BLOCKED_BY_SECURITY
BLOCKED_BY_ARCHITECTURE_DRIFT
MERGE_READY_WITH_EVIDENCE
```

`MERGE_READY_WITH_EVIDENCE` requires:

```txt
no blocking risk
CI evidence available when configured
test evidence available when required
no protected path violation
no unresolved architecture drift blocker
operator approval if write/merge action is requested
```

---

## 7. PR-6 Scope — Review Renderer

Add markdown review output:

```txt
Summary
Files Changed
Risk Map
Evidence
Architecture Impact
Security Notes
Merge-Readiness
Recommended Next Action
```

Renderer should produce draft text only.

No automatic GitHub comments in this phase.

---

## 8. PR-7 Scope — GitHub Read Adapter

Add GitHub read adapter for PR metadata and diff retrieval.

Allowed:

```txt
read PR metadata
read changed files
read CI status
read comments for context
```

Blocked:

```txt
create comments
approve PR
request changes
merge PR
push commits
modify labels
```

---

## 9. PR-8 Scope — Operator-Approved GitHub Comment Drafting

Add explicit operator-approved path for posting review comments.

Requirements:

```txt
operator approval required
review body preview required
audit note required
no approval/rejection action by default
no merge
```

---

## 10. PR-9 Scope — CodeMind Repair Loop

Connect Ajna findings back to CodeMind planning.

Example:

```txt
Ajna finds missing test coverage
  ↓
CodeMind drafts test plan
  ↓
operator approves implementation
  ↓
CodeMind applies patch
  ↓
Ajna reassesses PR
```

---

## 11. PR-10 Scope — AELIB External Adapter

AELIB integration should be a client adapter, not a code absorption.

AELIB should call CodeMind/Ajna as an external governed capability.

No AELIB internal runtime should be moved into CodeMind.

---

## 12. Hard Rules

```txt
No silent file writes.
No merge without operator approval.
No secret printing.
No protected path mutation without explicit approval.
No claim of green CI without evidence.
No merge-ready classification without evidence gates.
No AELIB-only coupling in the core Ajna package.
```

---

## 13. Final Build Rule

Build Ajna as CodeMind's third eye: calm, evidence-driven, deeply contextual, and always review-safe.