# Ajna GitHub API snapshot fixture command

The `codemind ajna github-api-snapshot-fixture <json-file>` command reads a local GitHub-shaped API payload and renders the collector snapshot JSON produced by the offline adapter.

It proves this local-only chain:

```text
GitHub-shaped payload JSON -> collector snapshot JSON
```

## Boundary

The command must remain:

- local-only
- read-only
- provider-free
- network-free
- mutation-free

It must not:

- call the GitHub API
- post PR comments
- approve or request changes
- merge pull requests
- run validation commands
- bypass the collector snapshot contract

## Why this exists

This command gives operators a way to inspect the collector snapshot produced by the offline API-shaped adapter before rendering a full Ajna review report.
