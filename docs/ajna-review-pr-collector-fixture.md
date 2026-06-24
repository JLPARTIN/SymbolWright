# Ajna review-pr collector fixture command

The `codemind ajna review-pr-collector-fixture <json-file>` command renders a local collector snapshot through the existing deterministic Ajna review-pr path.

This command is local-only. It does not fetch GitHub data, post comments, mutate repositories, call providers, run validation commands, or make merge decisions.

## Usage

```bash
codemind ajna review-pr-collector-fixture examples/ajna/github-collector-snapshot.ready.json
```

## Pipeline

```text
collector snapshot JSON -> AjnaGithubPullRequestPayload -> CodemindAjnaReviewPrInput -> Ajna Review Cortex report
```

The command uses:

- `buildAjnaGithubPullRequestPayloadFromCollectorSnapshot()`
- `normalizeGithubPullRequestForAjnaReview()`
- `buildAjnaReviewPrForInput()`

## Boundary

The command must remain:

- read-only
- local-file-backed
- deterministic
- provider-free
- network-free
- mutation-free

## Do Not Repeat guard

Do not use this command to replace the existing `ajna review-pr` command or the mocked GitHub payload fixture command. It only proves the collector snapshot contract can flow through Ajna before live GitHub ingestion exists.
