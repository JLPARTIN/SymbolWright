# CodeMind Permission Model

**Status:** Current Governance Reference  
**Version:** v2.0  
**Track:** Runtime Truth Alignment  
**Purpose:** Define how CodeMind separates runtime modes, hard safety rails, and optional governance/forensic controls.

---

## 1. Current Principle

CodeMind permissions should make useful direct work possible while making dangerous actions obvious and bounded.

Governance is a feature, not the default personality. The active runtime mode controls strictness:

```txt
PLAN_ONLY
READ_ONLY
PROPOSAL_ONLY
APPROVED_EXECUTION
```

`APPROVED_EXECUTION` is the direct execution mode. It may allow local writes, shell commands, git operations, provider/network use, validation commands, and GitHub writes when the active policy and credentials allow those capabilities.

`PLAN_ONLY`, `READ_ONLY`, and `PROPOSAL_ONLY` remain available for non-mutating planning, inspection, and proposal workflows.

Governance gates *mutation*, not *information*. Read-only network access — fetching docs, package pages, and error references, or running a search — carries none of the risk that shell execution, file writes, or GitHub writes do, so it is not gated behind runtime mode the way those are. The policy snapshot exposes this as `allowReadOnlyNetwork`, which is `true` in all four runtime modes. It is distinct from `allowNetwork`, which continues to gate the provider/LLM invocation channel and mutating network use, and remains mode-dependent (`false` outside `APPROVED_EXECUTION`).

The `web_fetch` and `web_search` tools build on this: they work immediately for public URLs with no allowlist or approval setup, and block only private/internal network targets and non-http(s) schemes by default — both overridable. See `docs/runtime/CODEMIND_WEB_TOOLS.md` for the full config, modes, and safety rails.

---

## 2. Runtime Modes

### PLAN_ONLY

Allowed:

```txt
propose steps
draft commands
draft patches in text
summarize risks
identify validation needs
read-only network access: docs/package lookups, web fetch/search, error/reference lookups
```

Blocked:

```txt
file writes
bash execution
git mutation
GitHub mutation
provider/network execution (the LLM invocation channel) unless explicitly enabled by a future policy
```

### READ_ONLY

Allowed:

```txt
read files
list directories
inspect package/config files
summarize code
search text
generate reports
collect evidence
read-only network access: docs/package lookups, web fetch/search, error/reference lookups
```

Blocked:

```txt
write files
run shell commands
modify git state
create branches
commit
push
merge
delete
```

### PROPOSAL_ONLY

Allowed:

```txt
draft patches without applying them
prepare validation plans
prepare PR notes
explain risk and rollback
produce operator-ready implementation guidance
read-only network access: docs/package lookups, web fetch/search, error/reference lookups
```

Blocked:

```txt
actual file writes
actual command execution
actual git mutation
actual GitHub writes
```

### APPROVED_EXECUTION

Allowed when exposed by the active runtime policy and available credentials:

```txt
local file edits
patch application
validation commands
shell commands
git operations
provider/network access
GitHub write operations
```

Still blocked by hard safety rails:

```txt
secret exposure
workspace escape
protected path mutation
force push
protected branch push
obvious destructive shell commands
GitHub writes without credentials
```

---

## 3. Permission Dispositions

Governance evaluators may still resolve actions to:

```txt
ALLOW
ASK
DENY
```

These dispositions are useful for forensic workflows, operator review packets, Ajna review, and explicit governance gates.

They are not the same thing as the global runtime mode. A direct `APPROVED_EXECUTION` agent can still be stopped by hard DENY invariants, but it should not be forced into ASK/approval behavior for routine implementation work.

Recommended resolution order for governed checks:

```txt
hard DENY invariant > explicit policy block > ASK when the mode requires review > ALLOW
```

---

## 4. Hard DENY Invariants

Always deny or block:

```txt
print secrets
write secrets
exfiltrate credential material
escape the workspace root
force push
push directly to main/master/production/release without an explicit protected-branch workflow
delete audit logs to hide activity
delete memory or review history to hide activity
bypass CI or release-readiness gates
run obvious destructive shell commands accidentally
```

These are runtime safety rails, not governance theater.

---

## 5. Protected Paths

Protected path policy should continue to block high-risk areas by default:

```txt
.git
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
secrets/
.secret/
node_modules
dist
coverage
credential material
```

Workflow and governance files may be changed in normal development PRs, but those changes should remain visible, reviewable, and validated through CI.

---

## 6. Tool Categories

Current and historical tool categories include:

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

Tool category alone does not decide whether a tool can run. The runtime mode, active policy snapshot, credentials, target path, command content, and hard safety rails decide execution.

---

## 7. Audit and Forensics

Audit records should be preserved for:

```txt
local writes
shell commands
GitHub writes
PR creation
CI failure diagnosis
runbook updates
project docs updates
policy changes
Ajna review and merge-readiness reports
```

Audit is evidence and traceability. It should not turn every routine action into an approval ceremony.

---

## 8. Ajna and Governance Role

Ajna and governance features remain important CodeMind capabilities:

```txt
risk review
merge-readiness evidence
policy analysis
operator review packets
forensic audit trails
release proof
```

They should be invoked when the operator asks for them, when the workflow requires them, or when hard safety rails detect risky behavior.

They should not make CodeMind act read-only by default when `APPROVED_EXECUTION` is active.

---

## 9. Final Rule

CodeMind should be direct-capable by runtime mode, forensic when requested, and always bounded by hard safety rails.
