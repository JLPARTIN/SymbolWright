# CodeMind

**AI coding-agent platform for building, fixing, and understanding codebases — featuring Ajna Review Cortex for deep PR insight and merge-readiness.**

CodeMind is being built as a standalone coding-agent platform. It is designed to understand repositories, plan work, write and repair code with approval, diagnose CI failures, prepare pull requests, and coordinate specialized review capabilities.

Ajna Review Cortex is the first native CodeMind capability: a third-eye review intelligence layer that analyzes pull requests beyond the visible diff.

## Taglines

```txt
CodeMind: Build. Fix. Understand.
Ajna: See beyond the code.
GitHub / PR Review: Expand your vision beyond the diff.
```

## Current Foundation Docs

```txt
docs/migration/AELIB_CODEMIND_EXTRACTION_NOTES.md
docs/roadmap/CODEMIND_PLATFORM_ROADMAP.md
docs/governance/CODEMIND_PERMISSION_MODEL.md
docs/governance/CODEMIND_THREAT_MODEL.md
docs/cli/CODEMIND_CLI_TERMINAL_UX_PLAN.md
docs/ajna/CODEMIND_AJNA_ROADMAP.md
docs/ajna/CODEMIND_AJNA_BUILD_PLAN.md
```

## Build Posture

CodeMind starts read-only and plan-first.

Write actions, command execution, PR creation, and merge operations require explicit operator approval and future policy gates.

## Relationship to AELIB-X1YA0I

CodeMind is extracted from earlier AELIB-side CODEFORGE/CODEMIND planning work, but it is now being developed as its own standalone platform.

AELIB-X1YA0I may later integrate CodeMind through a thin governed external adapter.

CodeMind should be able to work on any authorized repository, not only AELIB-X1YA0I.