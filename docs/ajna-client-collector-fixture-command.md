# Ajna client collector fixture command

The `codemind ajna client-collector-fixture <json-file>` command reads a local collector request and renders collector snapshot JSON through a fake injected client bridge.

It proves this local-only chain:

```text
request JSON -> fake client bridge -> collector snapshot JSON
```

## Boundary

This command remains local-only, read-only, and mutation-free. It does not perform live network work.
