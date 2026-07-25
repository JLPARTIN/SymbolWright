# Ajna review-pr client collector fixture command

The `symbolwright ajna review-pr-client-collector-fixture <json-file>` command reads a local request and renders an Ajna review report through a fake injected client bridge.

It proves this local-only chain:

```text
request JSON -> fake client bridge -> collector snapshot -> Ajna review report
```

## Boundary

This command remains local-only, read-only, and mutation-free. It does not perform live network work.
