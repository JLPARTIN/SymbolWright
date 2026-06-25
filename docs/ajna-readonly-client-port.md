# Ajna read-only client port

This module defines an injected client-port boundary for future collection work.

It does not perform network calls. It only combines results from an injected port into the existing offline payload shape.

## Pipeline

```text
request -> injected read-only port -> offline payload -> collector snapshot adapter
```

## Boundary

This layer must remain:

- read-only
- local-testable
- mutation-free
- independent from review rendering
- backed by fake ports in tests

Do not use this layer to post comments, approve reviews, merge pull requests, run shell commands, or bypass the offline adapter path.
