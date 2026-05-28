# CodeMind Permission Model

**Status:** Foundation Policy  
**Version:** v1.0  
**Track:** CODEMIND-2  
**Purpose:** Define the initial permission model for CodeMind tools, modes, and actions.

---

## 1. Core Principle

CodeMind must never assume permission.

Every tool action should resolve through a permission policy.

Default posture:

```txt
read is easiest
write requires approval
commands require approval
destructive actions are denied by default
```

---

## 2. Permission Dispositions

CodeMind actions resolve to one of:

```txt
ALLOW
ASK
DENY
```

Rule order:

```txt
DENY > ASK > ALLOW
```

Deny always wins.

---

## 3. Permission Modes

Recommended modes:

```txt
PLAN
READ_ONLY
ASK
PATCH_PROPOSAL
PR_REVIEW
CI_REVIEW
APPROVED_EDIT
APPROVED_COMMAND
RESTRICTED_AUTOMATION
```

No write-capable mode should be active by default.

---

## 4. PLAN Mode

Allowed:

```txt
read high-level repo maps
read project docs
propose steps
draft commands
draft patches in text
summarize risks
```

Blocked:

```txt
file writes
bash execution
git mutation
PR mutation
memory writes
network access unless explicitly enabled
```

---

## 5. READ_ONLY Mode

Allowed:

```txt
read files
list directories
inspect package files
inspect config files
summarize code
search text
generate reports
```

Blocked:

```txt
write files
run bash commands
modify git state
create branches
commit
push
merge
delete
```

---

## 6. ASK Mode

Allowed after approval:

```txt
specific file edits
specific test commands
specific build commands
specific git read commands
specific GitHub CLI read commands
```

Blocked unless separately approved:

```txt
destructive commands
force push
merge
delete branch
delete files
modify secrets
modify auth policy
modify memory state
```

---

## 7. Approved Edit Mode

Approved Edit mode may edit files only inside approved paths.

Each edit should produce:

```txt
files changed
reason
risk level
validation needed
rollback note
```

---

## 8. Approved Command Mode

Approved Command mode may run approved commands only.

Recommended safe command examples:

```bash
git status
git diff
npm run build
npm test -- --runInBand
```

Commands that require extra review:

```bash
git push
gh pr create
gh pr merge
git reset
git rebase
rm -rf
```

---

## 9. Deny-By-Default Actions

Deny by default:

```txt
delete audit logs
delete memory or review history
write secrets
print secrets
disable governance
bypass CI
force push
merge without operator approval
network ingestion without approval
unrestricted shell
silent file edits
```

---

## 10. Tool Categories

Initial tool categories:

```txt
READ_FILE
WRITE_FILE
LIST_DIR
SEARCH_TEXT
BASH_COMMAND
GIT_READ
GIT_WRITE
GH_READ
GH_WRITE
PROJECT_DOC_READ
PROJECT_DOC_WRITE
MEMORY_CANDIDATE
NATIVE_MEMORY_WRITE
NETWORK_FETCH
PR_REVIEW
CI_REVIEW
PATCH_PROPOSAL
```

---

## 11. Required Audit

Audit should be required for:

```txt
approved edits
approved commands
PR creation
CI failure diagnosis
runbook updates
project docs updates
memory candidate creation
policy changes
Ajna merge-readiness reports
```

---

## 12. Final Rule

CodeMind permissions should make the safe path easy and the dangerous path obvious.