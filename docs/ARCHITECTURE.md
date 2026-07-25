# SymbolWright Architecture

## Layered Architecture

```
┌─────────────────────────────────────────────┐
│                    CLI                       │
│  cli-doctor · cli commands · TUI            │
├─────────────────────────────────────────────┤
│               Activation                     │
│  activateSubsystems · runActivatedAgent      │
│  verifySubsystemHealth · renderReport        │
├─────────────────────────────────────────────┤
│               Agent Loop                     │
│  runAgentLoop · tool-schema-bridge           │
│  bridgeToolsForProvider · extractProviderTools│
├─────────────────────────────────────────────┤
│             Tool Assembly                    │
│  assembleAgentTools · RuntimeRegistry        │
│  assertToolAssemblyIntegrity                 │
├─────────────────────────────────────────────┤
│           Approval Gates                     │
│  assertApprovalGate · createApprovalTicket   │
│  formatApprovalSummary                       │
├─────────────────────────────────────────────┤
│              Policy                          │
│  assertValidPolicy · assertReadablePath      │
│  assertWriteApproved · assertShellAllowed    │
├─────────────────────────────────────────────┤
│           Runtime Types                      │
│  SymbolWrightToolName · RuntimePolicySnapshot    │
│  RuntimeToolContext · GoalPlan               │
└─────────────────────────────────────────────┘
```

## Key Patterns

- **Registry pattern**: `RuntimeRegistry` stores tools by name with `getOrThrow` for fail-fast lookups.
- **Gate pattern**: `assertApprovalGate` guards write operations behind explicit approval tickets with typed scopes.
- **Policy-first**: `assertValidPolicy` is called at every boundary — activation, tool bridging, and context validation.
- **Immutable transcript**: `appendTranscriptEntry` returns a new `RuntimeTranscript` rather than mutating state.
- **Typed error classification**: `classifyError` maps raw exceptions to `SymbolWrightError` with category, retryability, and recovery hints.
- **Event bus**: `RuntimeEventBus` provides structured pub/sub observability across subsystems.

## Data Flow

```
User input → CLI → Activation (policy validation, registry, dispatcher, TUI)
  → Agent Loop (provider streaming, tool calls, message accumulation)
    → Tool Execution (schema bridge filters tools by mode, executes against RuntimeToolContext)
      → Audit (RuntimeAuditLog records every action with timestamp)
        → Output (transcript rendering, TUI state updates, cost tracking)
```

## Safety Model

1. **Read-only by default**: `createDefaultRuntimePolicy()` sets `mode: 'READ_ONLY'` with all write flags `false`.
2. **Explicit approval required**: Write operations require an `ApprovalTicket` with typed `RuntimeApprovalScope` entries.
3. **Protected paths**: `assertReadablePath` blocks access to `.git`, `.env`, `node_modules`, and other configured paths.
4. **Scope validation**: `isValidApprovalScope` ensures only known scopes are accepted at runtime boundaries.
5. **Workspace containment**: `isPathInsideWorkspace` and `resolveWorkspacePath` prevent directory traversal.
6. **Output redaction**: `redactValidationOutput` strips secrets and environment leaks before persisting audit logs.

## Subsystem Map

| Subsystem | Purpose | Key Entry Points |
|-----------|---------|-----------------|
| **Runtime** | Types, policy, approval, audit, session, transcript | `src/runtime/` |
| **Agent** | LLM loop, tool schema bridge, streaming | `src/agent/` |
| **Provider** | LLM provider abstraction (Anthropic) | `src/provider/` |
| **Ajna** | Code review, merge readiness analysis | `src/ajna/` |
| **HiveMind** | Swarm agent registry and dispatch | `src/hivemind/` |
| **TUI** | Terminal UI state machine | `src/tui/` |
| **Storage** | Session persistence, audit ledger | `src/storage/` |
| **Telemetry** | Cost tracking, usage summaries | `src/telemetry/` |
| **Workspace** | Multi-repo workspace management, browser-facing polyglot code runner | `src/workspace/` |
| **Activation** | Subsystem wiring and health verification | `src/activation/` |
| **Observability** | Structured event bus for cross-cutting telemetry | `src/runtime/observability/` |
| **App** | Unified dashboard shell, views, and API route tables | `src/app/` |
| **Server** | Chat/provider/agent HTTP dispatcher the unified server wraps | `src/server/` |
| **Mission** | Workspace-facing mission CRUD/lifecycle state machine, events, store | `src/mission/` |
| **Autonomy** | Autonomous task-graph planner, coordinator, persistent executor, repair controller, semantic index | `src/autonomy/` |
| **Sandbox** | Docker-hardened validation/write sandbox; separate guarded-host code-playground backend | `src/sandbox/` |
| **GitHub** | External repository target parsing, acquisition, operations policy, PR-packet generation | `src/github/` |
| **MCP** | stdio MCP server and client, sharing the agent loop's tool registry | `src/mcp/` |
| **Kernel** | Agent-kernel context/mission packets, planning, and provider routing | `src/kernel/` |
