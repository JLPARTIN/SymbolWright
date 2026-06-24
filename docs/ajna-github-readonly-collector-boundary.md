# Ajna GitHub read-only collector boundary

This boundary defines the injected port that a future GitHub collector implementation must satisfy before live ingestion is added.

The current implementation is intentionally offline. It validates a request and calls an injected collector port. Tests use fake ports only.

## Request shape

```json
{
  "repository": "JLPARTIN/CodeMind",
  "pullRequestNumber": 62
}
```

Committed fixture:

```text
examples/ajna/github-readonly-collector-request.ready.json
```

## Pipeline

```text
read-only collector request -> injected collector port -> collector snapshot -> payload normalizer -> Ajna review-pr input
```

## Boundary rules

The boundary must remain:

- read-only
- deterministic at the Ajna layer
- provider-free
- mutation-free
- separated from the payload normalizer and renderer

The boundary must not:

- post pull request comments
- approve reviews
- request changes
- merge pull requests
- run shell commands
- bypass the collector snapshot contract
- bypass the existing Ajna review-pr renderer

## Future implementation rule

A future live GitHub collector may implement `AjnaGithubReadOnlyCollectorPort`, but it must return the existing collector snapshot shape. That keeps live collection separate from Ajna review logic and preserves deterministic review rendering.
