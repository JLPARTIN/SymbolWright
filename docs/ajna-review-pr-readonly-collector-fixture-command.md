# Ajna review-pr read-only collector fixture command

The `codemind ajna review-pr-readonly-collector-fixture <json-file>` command renders a local read-only collector request fixture through the full offline Ajna review path.

It proves this local-only chain:

```text
request fixture -> injected fake collector port -> collector snapshot -> GitHub payload -> Ajna review-pr input -> Ajna Review Cortex report
```

## Usage

```bash
codemind ajna review-pr-readonly-collector-fixture examples/ajna/github-readonly-collector-request.ready.json
```

## Boundary

The command must remain:

- local-only
- read-only
- provider-free
- network-free
- mutation-free
- backed by an injected fake collector port

It must not:

- call the GitHub API
- post PR comments
- approve or request changes
- merge pull requests
- run validation commands
- bypass the collector snapshot contract
- bypass the existing Ajna review-pr renderer

## Why this exists

This command closes the offline proof loop before live ingestion. A future live collector can replace the fake port, but the downstream Ajna review path should remain the same.
