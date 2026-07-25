# SymbolWright Trace Store

The Trace Store provides durable JSONL-based persistence and replay for Agent Kernel trace frames with lineage validation and invariant checking.

## Block Identity

- **Block ID**: `TRACE-STORE-01`
- **Phase**: Runtime Audit (Phase T extension)

## Capabilities

### Persist (`persistTraceFrames`)

Validates and persists trace frames. Frames must have non-empty `blockId`, `executionId`, `timestamp`, `payloadSummary`, and `invariants`.

### Serialize (`serializeTraceFrames`)

Converts trace frames to JSONL format with sequence numbers and storage timestamps. Invalid frames are skipped.

### Replay (`replayTraceFrames`)

Parses JSONL lines back into structured trace entries with:

- **Execution ID filtering**: Only replays frames matching the requested execution ID
- **Lineage validation**: Verifies block ordering follows the expected sequence (AGENT-KERNEL-01 through AGENT-KERNEL-06)
- **Invariant checking**: Ensures `providerInvoked`, `repoMutationAllowed`, and `commandExecutionAllowed` are all `false`

## Outcomes

| Outcome    | Meaning                                       |
|------------|-----------------------------------------------|
| `STORED`   | Frames validated and stored                   |
| `REPLAYED` | Frames replayed with valid lineage/invariants |
| `BLOCKED`  | Lineage gaps, invariant violations, or errors |
| `EMPTY`    | No frames or lines to process                 |

## CLI Usage

```bash
codemind trace-store fixtures/trace-store-fixture.json
```

## Finding Codes

| Code                   | Severity | Description                          |
|------------------------|----------|--------------------------------------|
| `FRAMES_STORED`        | INFO     | Frames stored successfully           |
| `FRAMES_REPLAYED`      | INFO     | Frames replayed successfully         |
| `STORE_EMPTY`          | INFO     | No frames to process                 |
| `INVALID_FRAME`        | WARN/ERR | Frame failed validation              |
| `LINEAGE_GAP`          | ERROR    | Block ordering violation detected    |
| `INVARIANT_VIOLATION`  | ERROR    | Safety invariant violated            |
