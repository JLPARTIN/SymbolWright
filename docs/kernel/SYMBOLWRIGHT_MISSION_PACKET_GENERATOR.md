# SymbolWright Agent Kernel Mission Packet Generator (AGENT-KERNEL-08)

This document describes the mission packet generator, which assembles a governed mission packet from the validated agent kernel pipeline outputs.

## Architecture

```text
AgentKernelContextPacket (AGENT-KERNEL-04)
  + AgentKernelProviderRoutePlan (AGENT-KERNEL-05)
    + AgentKernelRouteExecutionPreflightDecision (AGENT-KERNEL-06)
      └── AgentKernelMissionPacket (AGENT-KERNEL-08)
           ├── Objectives (PRIMARY / SECONDARY)
           ├── Constraints (rule + enforcer)
           ├── Success Criteria (measurable)
           └── Execution Boundary (steps, mutation, timeout)
```

## Pipeline position

The mission packet generator is block AGENT-KERNEL-08, consuming outputs from:
- **AGENT-KERNEL-04**: Context packet (provider readiness)
- **AGENT-KERNEL-05**: Provider route plan (route type and readiness)
- **AGENT-KERNEL-06**: Route execution preflight (acceptance gate)

## Mission statuses

| Status    | Meaning                                              |
|-----------|------------------------------------------------------|
| `READY`   | All prerequisites met; packet ready for execution    |
| `BLOCKED` | One or more blocking findings prevent assembly       |
| `DEGRADED`| Assembled with warnings (missing constraints, etc.)  |

## Finding codes

| Code                         | Severity | Meaning                                    |
|------------------------------|----------|--------------------------------------------|
| `CONTEXT_NOT_READY`          | BLOCK    | Context packet not provider-ready          |
| `ROUTE_NOT_READY`            | BLOCK    | Route plan not ready                       |
| `PREFLIGHT_NOT_READY`        | BLOCK    | Preflight not accepted                     |
| `MISSING_OBJECTIVE`          | BLOCK/WARN | No objectives or no PRIMARY objective    |
| `MISSING_CONSTRAINT`         | WARN     | No constraints specified                   |
| `SUCCESS_CRITERIA_EMPTY`     | WARN     | No success criteria specified              |
| `EXECUTION_BOUNDARY_EXCEEDED`| BLOCK    | Invalid maxSteps or timeoutMs              |
| `MISSION_ASSEMBLED`          | INFO     | Successfully assembled                     |
| `MISSION_DEGRADED`           | INFO     | Assembled with warnings                    |

## CLI usage

```bash
symbolwright mission-packet <json-file>
```

## Fixture format

The fixture JSON must include the full pipeline outputs (contextPacket, routePlan, preflightDecision) plus mission-specific fields (objectives, constraints, successCriteria, executionBoundary).

## Safety posture

- Planning-only: `providerInvoked` is always `false`
- Execution boundary enforces step limits, mutation policy, and timeouts
- Constraints are declarative and traced to their enforcer
- All findings are deterministic and auditable
- No side effects — mission packet generation is pure

## Implementation

```text
src/kernel/agent-kernel-mission-packet.ts        — mission packet generator
src/kernel/agent-kernel-mission-packet.spec.ts   — unit tests
src/cli-mission-packet.ts                        — CLI handler
fixtures/mission-packet-fixture.json             — example fixture
```
