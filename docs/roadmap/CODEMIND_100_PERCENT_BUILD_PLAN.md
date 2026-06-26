# CodeMind 100% Build Plan

This document records the build plan from 84% to 100%. Each bundle targets a specific capability gap.

## Current state: 84% (pre-bundle)

All 20 runtime phases (A–T) are complete. The runtime has a full CLI surface, governed read/write gates, Ajna review cortex, operator review, workflow composition, and deployment configuration.

## Bundle plan

### CM-100-A: Build State Reconciliation + Source-of-Truth Ledger (86%)

- Update stale `docs/runtime/CODEMIND_RUNTIME_BUILD_STATE.md` to post-Phase T
- Add build ledger as single source of truth for phase state
- Add consistency checks between README, docs, and runtime

### CM-100-B: Project Instruction Loader + Repository Context Kernel (88%)

- Add project instruction loading (README, CODEMIND.md, CLAUDE.md, AGENTS.md, copilot-instructions)
- Add project context kernel producing deterministic context packets
- Add `codemind project-context [dir]` CLI command
- Secret redaction and protected path exclusion

### CM-100-C: Live GitHub Read Adapter v1 (91%)

- Replace "not yet wired" with injected GitHub HTTP client
- Policy-gated read-only operations only
- Mocked HTTP tests, opt-in live mode

### CM-100-D: Approved Validation Command Executor + CI Diagnostics (93%)

- Turn validation command gate into actual safe executor
- Allowlisted commands only with approval
- Capture exit code, stdout/stderr, elapsed time, redacted transcript

### CM-100-E: Structured Patch Application CLI + Repair Loop v1 (95%)

- Connect proposal → approved patch → validation → Ajna reassessment
- `codemind apply-patch` and `codemind repair-loop` commands
- Checkpoint-based flow with no auto-approval

### CM-100-F: Approved GitHub Write Executor v1 (96.5%)

- Convert GitHub write gate to actual approved write execution
- Create draft PR, post comment, apply label only
- Mocked client tests, audit receipts

### CM-100-G: Agent Kernel Mission Packet Generator (98%)

- Generate handoff packets for Claude Code, Codex, Cursor, Cline, etc.
- Repository snapshot, build state, do-not-repeat ledger, safety boundaries

### CM-100-H: Durable Audit Ledger + Trace Store (99%)

- JSONL local audit ledger with redaction
- Replay repair loops, validations, GitHub writes, mission packets

### CM-100-I: Operator UX / Doctor / Codespaces / Release Hardening (100%)

- `codemind doctor`, `codemind version`, `codemind release-readiness`
- Full validation pass, README updated to v1 state

## 100% definition

CodeMind reaches 100% when it can safely perform the full governed loop: scan → load instructions → build context → plan → propose → approve → apply → validate → diagnose → prepare PR → create draft PR → review → assess merge-readiness → generate handoff → record/replay.

## Not required for 100%

- Auto-merge
- Auto-approve PRs
- Force push
- Unbounded shell
- Uncontrolled provider calls
- Secret access
- Silent background execution
