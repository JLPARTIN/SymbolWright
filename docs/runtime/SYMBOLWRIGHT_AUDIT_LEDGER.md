# CodeMind Audit Ledger Store

The Audit Ledger Store provides durable JSONL-based persistence and replay for runtime audit events.

## Block Identity

- **Block ID**: `AUDIT-LEDGER-01`
- **Phase**: Runtime Audit (Phase T extension)

## Capabilities

### Persist (`persistAuditLedger`)

Validates and persists audit events. Invalid events (empty action or detail) are rejected with findings. Sensitive content (GitHub tokens, API keys, Bearer tokens) is automatically redacted before persistence.

**Redacted patterns:**
- `ghp_*` — GitHub personal access tokens
- `gho_*` — GitHub OAuth tokens
- `github_pat_*` — GitHub fine-grained tokens
- `sk-*` — API secret keys
- `Bearer *` — Bearer authorization tokens

### Serialize (`serializeAuditLedger`)

Converts audit events to JSONL format with sequence numbers, timestamps, and redaction flags. Invalid events are skipped. Each line is a self-contained JSON object.

### Replay (`replayAuditLedger`)

Parses JSONL lines back into structured audit ledger entries. Validates entry structure, skips blank lines, and reports mismatches.

## Outcomes

| Outcome     | Meaning                                 |
|-------------|----------------------------------------|
| `PERSISTED` | Events validated and persisted         |
| `REPLAYED`  | JSONL entries replayed successfully    |
| `BLOCKED`   | Invalid entries detected during replay |
| `EMPTY`     | No events or lines to process          |

## CLI Usage

```bash
codemind audit-ledger fixtures/audit-ledger-fixture.json
```

## Finding Codes

| Code              | Severity | Description                          |
|-------------------|----------|--------------------------------------|
| `LEDGER_PERSISTED`| INFO     | Ledger persisted successfully        |
| `LEDGER_REPLAYED` | INFO     | Ledger replayed successfully         |
| `LEDGER_EMPTY`    | INFO     | No events to process                 |
| `EVENTS_REDACTED` | INFO     | Sensitive content was redacted       |
| `INVALID_EVENT`   | WARN     | Event failed validation              |
| `REPLAY_MISMATCH` | WARN/ERR | Entry failed replay validation       |
