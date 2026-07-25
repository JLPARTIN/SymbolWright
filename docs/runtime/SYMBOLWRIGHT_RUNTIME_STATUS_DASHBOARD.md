# SymbolWright Runtime Status Dashboard

**Phase:** S
**Status:** COMPLETE
**Command:** `codemind runtime-status`

## Purpose

Phase S adds a runtime status dashboard that provides a comprehensive view of the runtime state. This completes the runtime build sequence by giving operators a single command to inspect the full tool inventory, policy configuration, and phase completion status.

## Dashboard Contents

- Completed phase count
- Next phase (or "none" if all complete)
- Registered tool count and full tool name list
- Unique capability set
- Policy snapshot (mode, network, shell, writes, GitHub writes, protected paths)
- Workflow and Ajna workflow support flags
- Phase summary (all phases with state)

## CLI

```bash
codemind runtime-status
```

## Boundary

```text
read-only status only
no new mutation surface
no network calls
no file writes
no GitHub writes
```
