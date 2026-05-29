# CodeMind Next-Arc Neural Wiring Plan

## Purpose

This document maps the intended signal flow from the existing Agent Kernel arc into the next Ajna Review Intelligence arc.

## Current Kernel Chain

```txt
AK-01 Planning Substrate
  -> Planning signal
AK-02 Workflow Validator
  -> Workflow validation signal
AK-03 Skill Registry + Skill Validator
  -> Skill validation signal
AK-04 Context Packet Builder
  -> Context packet signal
AK-05 Provider Routing Gateway
  -> Route recommendation signal
AK-06 Route Execution Preflight
  -> Preflight decision signal
AK-07 Deterministic Trace Replay
  -> Trace replay report
```

## Existing Proof Harness Touchpoints

```txt
Trace Replay Report
  -> Kernel Trace Proof
Proof Harness Reports
  -> Ajna Proof Matrix
Repo Context
  -> Repo Context Proof
Permission Policy
  -> Governance Proof
Runtime Flags
  -> Runtime Boundary Proof
GitHub PR Context
  -> GitHub Adapter Proof
All Proof Domains
  -> Ajna Proof Gate
```

## Proposed Ajna Review Intelligence Flow

```txt
Ajna Review Session
  -> Ajna Proof Bundle
  -> Ajna Risk Synthesis
  -> Ajna Merge Decision
  -> Ajna Review Report Composer
  -> Ajna Review Pipeline
  -> Ajna Operator Summary
  -> Ajna Snapshot Fixtures
  -> Ajna Golden Reports
  -> Developer Integration Guide
```

## ASCII Kernel + Ajna Graph

```txt
AK-01 Planning
  |
  v
AK-02 Workflow Validator
  |
  v
AK-03 Skill Registry / Skill Validator
  |
  v
AK-04 Context Packet Builder
  |
  v
AK-05 Provider Routing Gateway
  |
  v
AK-06 Route Execution Preflight
  |
  v
AK-07 Trace Replay
  |
  v
CODEMIND-PROOF-HARNESS-02 Kernel Trace Proof
  |
  v
CODEMIND-PROOF-HARNESS-10 Ajna Proof Gate
  |
  v
PR-CM-AJNA-01 Review Session
  |
  v
PR-CM-AJNA-02 Proof Bundle
  |
  v
PR-CM-AJNA-03 Risk Synthesis
  |
  v
PR-CM-AJNA-04 Merge Decision
  |
  v
PR-CM-AJNA-05 Review Report Composer
  |
  v
PR-CM-AJNA-06 Review Pipeline
  |
  v
PR-CM-AJNA-07 Operator Summary
```

## Connective Tissue Recommendations

### Neurons

- `ReplayReportNeuron`: carries AK-07 replay output into Kernel Trace Proof.
- `ProofBundleNeuron`: carries proof domain statuses into Ajna Review Intelligence.
- `RiskSignalNeuron`: carries risk synthesis output into merge decision.
- `OperatorSummaryNeuron`: carries final review summary to future UI or GitHub preview layers.

### Glia

- `GovernanceGlia`: stabilizes governance proof and operator-review status.
- `RuntimeBoundaryGlia`: stabilizes runtime invariant proof.
- `RepoContextGlia`: buffers repo context evidence before Ajna consumption.

### Bridges

- `KernelToProofBridge`: formalizes AK trace replay into proof harness input.
- `ProofToAjnaBridge`: formalizes Proof Harness output into Ajna proof bundle input.
- `AjnaToOperatorBridge`: formalizes review pipeline output into operator summary output.

## Critical Path

```txt
Trace replay evidence -> proof domain status -> proof gate -> risk synthesis -> merge decision -> report -> operator summary
```

## Highest-Risk Boundary Crossings

- Proof Harness to Ajna: must preserve deterministic status mapping.
- Governance Proof to Risk Synthesis: must not downgrade blocked governance findings.
- Runtime Boundary Proof to Merge Decision: any invalid boundary must block merge readiness.
- Ajna Report to Future GitHub Surface: must remain read-only until a later approved write gateway exists.

## Rule

No neural wiring component may create runtime actuation. All wiring in this block carries data only.
