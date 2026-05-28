# AELIB → CodeMind Extraction Notes

**Status:** Foundation migration note  
**Source repository:** `JLPARTIN/AELIB--X1YA0I`  
**Target repository:** `JLPARTIN/JLPARTIN-CodeMind`  
**Purpose:** Record which AELIB-side CODEFORGE/CODEMIND concepts are being carried forward into the standalone CodeMind platform.

---

## 1. Migration Decision

CodeMind is now treated as a standalone AI coding-agent platform.

AELIB-X1YA0I may later integrate CodeMind as an external governed capability, but CodeMind should not be trapped inside AELIB runtime internals.

This repository becomes the source of truth for:

```txt
repo intelligence
code generation
bug fixing
patch planning
CI diagnosis
PR review
merge-readiness analysis
Ajna Review Cortex
tool policy
operator approval boundaries
future CLI/runtime implementation
```

AELIB remains the synthetic-brain architecture. CodeMind becomes the coding-agent platform.

---

## 2. What Was Extracted Conceptually

The original AELIB work used the name `CODEFORGE` for a governed coding-agent layer. That work is being adapted into CodeMind-native language.

Useful carry-forward concepts:

```txt
read-only first implementation
operator approval gates
permission dispositions
protected path policy
repo inventory scanning
PR/CI review lanes
patch proposal mode
no silent mutation
no merge without approval
no unverified claims about test status
trust boundaries for repo files, logs, PR text, generated output, and project instructions
```

---

## 3. Naming Migration

| AELIB-era term | CodeMind-era term |
|---|---|
| CODEFORGE | CodeMind Platform |
| CODEFORGE adapter | CodeMind runtime adapter |
| CODEFORGE permission model | CodeMind tool permission model |
| CODEFORGE CLI | CodeMind CLI |
| CODEFORGE skill cards | CodeMind skill cards |
| PR review helper | Ajna Review Cortex |

Ajna is not the whole product. Ajna is a native CodeMind capability focused on deep PR review, hidden-risk detection, and merge-readiness.

---

## 4. Extraction Boundaries

This migration does **not** import AELIB runtime internals.

Out of scope for this initial extraction:

```txt
AELIB SyntheticBrainService internals
HAL runtime mutation paths
Native Memory Bank writes
AELIB doctrine promotion logic
AELIB-specific integration bus runtime wiring
AELIB operator console UI code
```

The new CodeMind repository should carry forward reusable contracts, docs, and safety doctrine first. Runtime code should be rebuilt in CodeMind-native form.

---

## 5. Required Standalone Rule

CodeMind must be able to work on any repository, not only AELIB-X1YA0I.

Therefore, CodeMind contracts should avoid AELIB-only assumptions unless they appear inside a future AELIB adapter package.

---

## 6. Final Migration Rule

Copy ideas, contracts, and safety boundaries from AELIB.

Do not blindly copy AELIB-specific runtime coupling.

CodeMind should become its own platform, with AELIB as one future client/integration target.