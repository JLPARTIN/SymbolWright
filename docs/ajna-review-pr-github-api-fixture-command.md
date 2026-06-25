# Ajna review-pr GitHub API fixture command

The `codemind ajna review-pr-github-api-fixture <json-file>` command renders a local GitHub-shaped API payload through the existing deterministic Ajna review-pr path.

It proves this local-only chain:

```text
GitHub-shaped payload JSON -> collector snapshot -> GitHub payload -> Ajna review-pr input -> Ajna Review Cortex report
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
- bypass the existing Ajna review-pr renderer

## Why this exists

This command proves the offline API-shaped adapter can feed the full Ajna review path before any live GitHub collector is introduced.
