# Ajna GitHub API payload adapter

This adapter maps offline GitHub-shaped pull request data into the existing Ajna collector snapshot contract.

It is not a live GitHub client. It only accepts already-provided local data shaped like pull request metadata, changed files, and check runs.

## Pipeline

```text
local GitHub-shaped payload -> collector snapshot -> AjnaGithubPullRequestPayload -> SymbolWrightAjnaReviewPrInput -> Ajna review report
```

## Boundary

The adapter must remain:

- local-only
- read-only
- deterministic
- provider-free
- network-free
- mutation-free

It must not:

- call the GitHub API
- post pull request comments
- approve or request changes
- merge pull requests
- run shell commands
- bypass the collector snapshot contract

## Why this exists

This is the final offline adapter layer before a future live collector. Live collection can later fill the same input shape, but Ajna review rendering should continue through the same collector snapshot and normalizer path.
