# Ajna GitHub read-only collector fixture command

The `codemind ajna github-readonly-collector-fixture <json-file>` command reads a local collector request fixture and renders the collected snapshot JSON through an injected fake read-only collector port.

This command is a local boundary harness. It proves the CLI can call the read-only collector boundary without introducing live GitHub ingestion.

## Usage

```bash
codemind ajna github-readonly-collector-fixture examples/ajna/github-readonly-collector-request.ready.json
```

## Boundary

The command must remain:

- local-only
- read-only
- provider-free
- network-free
- mutation-free
- backed by an injected fixture port

It must not:

- call the GitHub API
- post PR comments
- approve or request changes
- merge pull requests
- run validation commands
- bypass the collector snapshot contract

## Next live step

A future live collector can implement `AjnaGithubReadOnlyCollectorPort`, but it should reuse the same request validation and snapshot output shape.
