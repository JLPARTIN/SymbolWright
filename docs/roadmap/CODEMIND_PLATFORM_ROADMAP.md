# CodeMind Platform Roadmap

**Status:** Foundation Roadmap  
**Version:** v1.0  
**Track:** CODEMIND-1  
**Purpose:** Define the standalone CodeMind platform build sequence.

---

## 1. Roadmap Purpose

CodeMind is a standalone AI coding-agent platform for building, fixing, understanding, and safely evolving codebases.

It should be built in controlled phases.

The first phase defines platform doctrine, safety boundaries, migration notes, and Ajna Review Cortex positioning.

Runtime execution should come later.

---

## 2. Platform Definition

CodeMind is intended to become a repository-aware, tool-governed coding agent that can help an operator:

```txt
understand a codebase
scan project structure
plan implementation work
write code
propose patches
edit files when approved
run tests when approved
diagnose CI failures
review pull requests
assess merge-readiness
maintain project runbooks
support Codespaces workflows
coordinate specialized capabilities such as Ajna Review Cortex
```

CodeMind is not limited to AELIB-X1YA0I. It should be able to work across any repository the operator authorizes.

---

## 3. Foundation Phases

```txt
CODEMIND-1: Platform Foundation Doctrine and Migration Notes
CODEMIND-2: Permission Model and Tool Policy
CODEMIND-3: CLI / Terminal UX Contract
CODEMIND-4: Project Context Scanner
CODEMIND-5: CODEMIND.md Project Instructions Loader
CODEMIND-6: Skill Registry and Slash Commands
CODEMIND-7: Plan Mode and Patch Proposal Mode
CODEMIND-8: Read/Edit/Bash Tool Abstractions
CODEMIND-9: Git / PR / CI Workflow Adapter
CODEMIND-10: Codespaces Setup and Operator Runbook
```

---

## 4. Ajna Track

Ajna Review Cortex is the first native CodeMind capability.

```txt
AJNA-1: Ajna Identity, Roadmap, and Build Plan
AJNA-2: PR Review Contract and Output Schema
AJNA-3: Diff + Repo Context Analyzer
AJNA-4: Risk Classifier
AJNA-5: Merge-Readiness Score
AJNA-6: CI / Test Evidence Adapter
AJNA-7: GitHub PR Comment Drafting
AJNA-8: Review Memory and Pattern Recall
AJNA-9: CodeMind Runtime Integration
AJNA-10: AELIB External Adapter Contract
```

Ajna does not replace CodeMind. Ajna expands CodeMind's perception around PRs, hidden risk, architecture drift, and merge-readiness.

---

## 5. Runtime Implementation Phases

After the foundation track:

```txt
CODEMIND-R1: Implement CLI Skeleton
CODEMIND-R2: Implement Read-Only Repo Scanner
CODEMIND-R3: Implement CODEMIND.md Loader
CODEMIND-R4: Implement Permission Policy Evaluator
CODEMIND-R5: Implement Plan Object Renderer
CODEMIND-R6: Implement Patch Proposal Renderer
CODEMIND-R7: Implement Read Tools
CODEMIND-R8: Implement Approved Command Dry-Run Gate
CODEMIND-R9: Implement Approved File Edit Gate
CODEMIND-R10: Implement Git / PR / CI Read Adapters
CODEMIND-R11: Implement Ajna PR Review Engine
CODEMIND-R12: Implement Operator Review Gate for Write Actions
```

---

## 6. Do Not Skip

Do not skip:

```txt
permission policy
operator approval
audit logging
read-only first implementation
tests
Codespaces validation
CI validation
protected path rules
secret redaction
PR evidence discipline
```

---

## 7. First Runtime Bias

First runtime implementation should be:

```txt
read-only
local-first
no network by default
no file writes
no bash execution
no secret printing
no uncontrolled PR mutation
```

---

## 8. Recommended Next Step

After CODEMIND-1, proceed to:

```txt
CODEMIND-2: Permission Model and Tool Policy
```

This should lock the safety gates before runtime code becomes powerful.

---

## 9. Final Roadmap Rule

Build CodeMind like a serious coding-agent platform, not a loose chatbot prompt.