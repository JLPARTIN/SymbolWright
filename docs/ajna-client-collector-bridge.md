# Ajna client collector bridge

This bridge adapts an injected read-only client port into the existing collector snapshot port.

It does not perform network work by itself. Tests use fake ports only.

## Pipeline

```text
collector request -> injected client port -> offline payload -> collector snapshot
```

## Boundary

This layer must remain read-only, local-testable, mutation-free, and separate from review rendering.
