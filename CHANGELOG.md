# Changelog

All notable changes to CodeMind are documented in this file.

## [0.1.0] - 2026-06-28

### Added

- **Runtime Phases A-T**: Full governed loop from read-only planning through approved execution, PR creation, review, and merge-readiness assessment.
- **Ajna Review Cortex**: Deterministic code review layer with PR evidence schema, collector fixtures, review normalization, and merge-readiness reporting.
- **Agent Loop**: Multi-turn interactive coding agent with tool schema bridge, streaming provider support, session persistence, and cost tracking.
- **Operator Console**: Interactive workspace console with 18 commands (`/zflow`, `/workspace`, and 16 core commands), aliases, history tracking, and persistent history store.
- **Runtime Tool Assembly**: 44 registered tools across 22 capability categories with typed tool definitions and policy-gated execution.
- **Approval Gates**: Typed approval scopes (`file:write`, `github:write`, `command:validate`, `shell:execute`, `git:write`) with ticket validation at every boundary.
- **GitHub Live Read**: Policy-gated GitHub PR, CI, and file read operations behind explicit `allowNetwork` policy gates.
- **GitHub Write Surface**: Governed draft PR creation, comment posting, and label application through approval-gated write gates with audit trails.
- **Local File Write Gate**: Approval-gated file writes with protected path enforcement, workspace containment, dry-run mode, and before/after diff capture.
- **Validation Command Gate**: Allowlisted command execution (`npm test`, `npm run typecheck`, `npm run lint`, etc.) behind approval tickets.
- **Repair Loop**: Ajna finding through patch proposal, apply, validate, reassess, and merge-readiness pipeline.
- **Runtime Workflows**: Governed tool composition with bounded step execution and transcript capture.
- **Audit Trail**: Persist and replay audit ledger entries and agent kernel trace frames with automatic secret redaction.
- **Project Memory**: Vector store with cosine similarity search, disk persistence, and RAG context builder for semantic codebase queries.
- **Workspace Manager**: Multi-repo workspace management with primary selection and cross-repo file lookups.
- **HiveMind**: Swarm agent registry and dispatch for specialized capability coordination.
- **Build Ledger**: Machine-readable build state with 20/20 phase completion tracking and docs consistency checking.
- **Doctor**: 12-point workspace health check covering Node.js version, dependencies, TypeScript config, runtime phases, safety posture, API keys, and project memory.
- **Release Readiness**: 13-gate release assessment (phases, health, version, changelog consistency, entry point, exports, CLI, Dockerfile, public API contract, bin contract, validate script, workflow proof, and build-ledger consistency).
- **CI Pipeline**: Node 20+22 matrix testing, coverage enforcement (85/80/85/85 thresholds), format checking, and publish dry-run validation.
- **75 CLI commands** covering all 20 runtime phases plus diagnostics, fixtures, and agent workflows.
- **Release Proof Contract Tests**: Public API, package bin, workflow release proof, and source-of-truth build ledger regression coverage.

### Safety Posture

- Read-only by default with plan-first execution model.
- All write operations require explicit approval tickets with typed scopes.
- Protected paths (`.git`, `.env`, `node_modules`, `dist`, `coverage`) enforced at every boundary.
- Workspace containment prevents directory traversal.
- Output redaction strips secrets before audit log persistence.
- GitHub writes limited to draft PRs, comments, and labels (no merge, no force push, no branch deletion).

### Fixed

- **Runtime Activation Tool Inventory**: `runActivatedAgent()` now passes `subsystems.tools` (including dynamic GitHub live-read tools) to the agent loop instead of `config.tools`, which omitted dynamically injected tools.
- **Workspace Package Bin**: `codemind-workspace` now renders real workspace state from `WorkspaceManager` instead of a static preview surface. Operator `/workspace` and package bin share the same workspace model.
- **Build Ledger README Parsing**: Source-of-truth consistency checks now accept README wording used by the active project state (`20/20 runtime build phases complete` and `All 20 runtime phases are complete`) instead of requiring one brittle phrase.

### Changed

- **GitHub Write Authorization**: Centralized write authorization with execution mode tracking and approval scope closure.
- **Runtime Registry**: Replaced 22 wrapper registries with canonical `createFixtureRegistry()` factory supporting 22 named presets.
- **Operator Console**: Wired dormant `WorkspaceManager` into operator workspace via `/workspace` command; added `/zflow` for ZFlow report rendering.
- **Release Gates**: Expanded release readiness beyond CHANGELOG consistency to enforce public API, package bin, validate-script, workflow release-proof, and build-ledger source-of-truth gates.
- **License**: Changed from UNLICENSED to MIT license.
- **Package Contract**: Added `exports` field for ESM resolution, npm script aliases for diagnostic commands (`doctor`, `release-readiness`, `build-ledger`), and a shared `validate` release proof script.
- **Deploy Pipeline**: Hardened deploy workflow to run the shared validate release proof gate before container publishing.
- **Publish Pipeline**: Hardened publish workflow to run the shared validate release proof gate before npm dry-run and release publishing.

### Removed

- **docs/pr-plans/**: 30 completed PR plan files superseded by merged PRs (PR-2 through PR-CM-TEST-10).
- **docs/next-arc/**: 5 superseded analysis files (ANALYSIS_REPORT, NEURAL_WIRING_PLAN, PR_BUILD_PLAN, PR_IDEATION_MATRIX, VITEST_TEST_INTELLIGENCE_PLAN).
- **docs/roadmap/**: 2 stale roadmap files (CODEMIND_PLATFORM_ROADMAP, CODEMIND_100_PERCENT_BUILD_PLAN) superseded by build ledger and release readiness gates.
