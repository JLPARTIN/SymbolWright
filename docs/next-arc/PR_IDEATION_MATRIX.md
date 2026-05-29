# CodeMind Next-Arc PR Ideation Matrix

## Scoring Model

Each candidate is scored from 1 to 5 across:

```txt
operator value
developer value
risk
implementation difficulty
dependency readiness
proof/testability
sequence priority
```

Higher operator/developer/readiness/testability/priority is better. Lower risk/difficulty is better.

## Candidate Pool

| ID | Vector | Candidate | Operator | Developer | Risk | Difficulty | Readiness | Testability | Priority |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| C01 | Kernel Chain | AK-08 Kernel Chain Report Renderer | 5 | 5 | 1 | 2 | 5 | 5 | 5 |
| C02 | Kernel Chain | AK-09 Kernel Snapshot Store | 4 | 5 | 2 | 3 | 4 | 5 | 4 |
| C03 | Kernel Chain | AK-10 Kernel Replay Comparator | 4 | 5 | 2 | 3 | 4 | 5 | 4 |
| C04 | Observability | Kernel Health Summary | 5 | 4 | 1 | 2 | 5 | 5 | 5 |
| C05 | Observability | Proof Timeline Renderer | 4 | 4 | 1 | 2 | 5 | 5 | 4 |
| C06 | Observability | Trace Warning Classifier | 4 | 4 | 1 | 2 | 5 | 5 | 4 |
| C07 | Memory | Read-Only Session Snapshot Index | 4 | 4 | 2 | 3 | 3 | 4 | 3 |
| C08 | Memory | Durable Proof Manifest | 4 | 5 | 2 | 3 | 4 | 5 | 4 |
| C09 | Orchestration | Ajna Review Session Contract | 5 | 5 | 1 | 2 | 5 | 5 | 5 |
| C10 | Orchestration | Ajna Proof Bundle Aggregator | 5 | 5 | 1 | 2 | 5 | 5 | 5 |
| C11 | Orchestration | Ajna Risk Synthesis Engine | 5 | 5 | 2 | 3 | 5 | 5 | 5 |
| C12 | Orchestration | Ajna Merge Decision Model | 5 | 5 | 2 | 3 | 5 | 5 | 5 |
| C13 | Orchestration | Ajna Review Pipeline Orchestrator | 5 | 5 | 2 | 3 | 4 | 5 | 5 |
| C14 | Human-in-Loop | Operator Review Summary | 5 | 4 | 1 | 2 | 5 | 5 | 5 |
| C15 | Human-in-Loop | Operator Approval Preview Contract | 5 | 4 | 2 | 3 | 4 | 5 | 4 |
| C16 | Recovery | Partial Proof Failure Classifier | 4 | 5 | 1 | 2 | 5 | 5 | 4 |
| C17 | Recovery | Safe Degradation Report | 4 | 4 | 1 | 2 | 4 | 5 | 4 |
| C18 | Connective Tissue | Replay Report Neuron | 4 | 5 | 1 | 2 | 4 | 5 | 4 |
| C19 | Connective Tissue | Proof Bundle Bridge | 5 | 5 | 1 | 2 | 5 | 5 | 5 |
| C20 | Connective Tissue | Governance Glia Buffer | 4 | 5 | 2 | 3 | 4 | 5 | 4 |
| C21 | DX | Next-Arc Fixture Pack | 4 | 5 | 1 | 2 | 5 | 5 | 4 |
| C22 | DX | Snapshot Golden Reports | 4 | 5 | 1 | 2 | 5 | 5 | 4 |
| C23 | DX | Proof Harness Developer Guide | 3 | 5 | 1 | 1 | 5 | 4 | 3 |
| C24 | DX | CI Test Sharding Plan | 3 | 5 | 2 | 3 | 3 | 5 | 3 |

## Selected Arc Rationale

The highest-value immediate next arc is Ajna Review Intelligence. It consumes the completed Proof Harness and turns the system into an operator-useful review pipeline without crossing into GitHub write behavior or autonomous execution.
