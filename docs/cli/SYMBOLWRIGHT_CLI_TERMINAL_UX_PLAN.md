# SymbolWright CLI / Terminal UX Plan

**Status:** Foundation UX Contract  
**Version:** v1.0  
**Track:** SYMBOLWRIGHT-3  
**Purpose:** Define the operator-facing terminal command surface before expanding runtime tools.

---

## 1. Purpose

SymbolWright should become a terminal-first coding assistant while remaining permission-gated, audit-aware, and operator-controlled.

This document defines the planned command surface only.

It does not activate:

```txt
write tools
bash execution
GitHub mutation
memory writes
network tools
autonomous repo changes
```

---

## 2. UX Principles

SymbolWright must follow these principles:

```txt
plan before action
read before write
explain risk before execution
ask before mutation
deny dangerous operations by default
prefer branch and PR workflows
never self-authorize
record validation expectations
preserve operator review
```

---

## 3. Command Surface v0

Planned operator-facing commands:

```txt
/codemind plan <goal>
/codemind scan
/codemind read <path>
/codemind search <query>
/codemind propose-patch <goal>
/codemind validation-plan
/codemind ci-review
/codemind pr-notes
/codemind status
/codemind help
```

Ajna-specific commands:

```txt
/codemind ajna review-pr <pr>
/codemind ajna risk-map <pr>
/codemind ajna merge-readiness <pr>
/codemind ajna architecture-drift <pr>
```

These commands are UX contracts. They do not prove that runtime execution is active.

---

## 4. Command Contracts

| Command | Purpose | Default Mode | Mutation Allowed | Approval Needed |
|---|---|---|---|---|
| `/codemind plan <goal>` | Produce a repository work plan | PLAN | No | No |
| `/codemind scan` | Summarize repository structure | READ_ONLY | No | No |
| `/codemind read <path>` | Read approved file content | READ_ONLY | No | No |
| `/codemind search <query>` | Search repository text | READ_ONLY | No | No |
| `/codemind propose-patch <goal>` | Draft a patch plan without applying it | PATCH_PROPOSAL | No | No |
| `/codemind validation-plan` | Propose validation commands | PLAN | No | No |
| `/codemind ci-review` | Diagnose CI failures from available logs/context | CI_REVIEW | No | Approval required for external actions |
| `/codemind pr-notes` | Draft PR summary or review notes | PR_REVIEW | No | No |
| `/codemind status` | Report SymbolWright mode and policy status | READ_ONLY | No | No |
| `/codemind help` | Show available command surface | PLAN | No | No |
| `/codemind ajna review-pr <pr>` | Produce an Ajna PR review report | PR_REVIEW | No | No |
| `/codemind ajna merge-readiness <pr>` | Assess merge-readiness from evidence | PR_REVIEW | No | No |

---

## 5. Output Contract

Every SymbolWright command should eventually return:

```txt
intent
mode
permission decision
planned actions
files read
files proposed for change
risk level
operator approval needed
audit note
rollback note if applicable
validation commands
evidence status
```

Ajna commands should also return:

```txt
review scope
diff summary
risk map
test evidence
architecture impact
security notes
merge-readiness status
recommended next action
```

---

## 6. Terminal Interaction Pattern

SymbolWright should use this terminal pattern:

```txt
operator request
  ↓
repo context scan
  ↓
mode selection
  ↓
permission evaluation
  ↓
plan render
  ↓
approval gate
  ↓
execution or proposal
  ↓
validation
  ↓
summary
  ↓
audit / project note
```

---

## 7. Non-Goals

SymbolWright must not provide:

```txt
autonomous merge
direct main mutation
force push
secret printing
governance bypass
unrestricted shell
silent file edits
network ingestion by default
```

---

## 8. Future Runtime Mapping

| UX Contract | Future Runtime Phase |
|---|---|
| `/codemind plan` | SYMBOLWRIGHT-R1 / SYMBOLWRIGHT-R5 |
| `/codemind scan` | SYMBOLWRIGHT-R2 |
| `/codemind read` | SYMBOLWRIGHT-R7 |
| `/codemind search` | SYMBOLWRIGHT-R2 / SYMBOLWRIGHT-R7 |
| `/codemind propose-patch` | SYMBOLWRIGHT-R5 |
| `/codemind validation-plan` | SYMBOLWRIGHT-R5 |
| `/codemind ci-review` | SYMBOLWRIGHT-R9 |
| `/codemind pr-notes` | SYMBOLWRIGHT-R8 |
| `/codemind status` | SYMBOLWRIGHT-R1 |
| `/codemind help` | SYMBOLWRIGHT-R1 |
| `/codemind ajna review-pr` | AJNA-3 / AJNA-4 |
| `/codemind ajna merge-readiness` | AJNA-5 |

---

## 9. Operator Confirmation Boundary

Any command that would mutate repository state must stop at an approval gate.

Examples requiring approval:

```txt
file edits
branch creation
git push
PR creation
test execution
build execution
workflow mutation
project notes updates
memory candidate creation
```

---

## 10. Final Rule

The command surface should make safe behavior easy and dangerous behavior obvious.