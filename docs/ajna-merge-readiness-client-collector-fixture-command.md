# Ajna merge-readiness client collector fixture command

The `symbolwright ajna merge-readiness-client-collector-fixture <json-file>` command reads a local request and renders Ajna merge-readiness through a fake injected client bridge.

It proves this local-only chain:

```text
request JSON -> fake client bridge -> collector snapshot -> Ajna review input -> merge-readiness
```

## Boundary

This command remains local-only, read-only, and mutation-free. It does not perform live network work.
