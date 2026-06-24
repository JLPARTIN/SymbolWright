# Ajna GitHub collector contract

This document defines the offline collector contract that sits before the existing mocked GitHub payload normalizer.

The contract is intentionally pure and local. It prepares the data shape that a future read-only GitHub collector may produce, but it does not perform network ingestion itself.

## Pipeline

```text
collector snapshot -> AjnaGithubPullRequestPayload -> CodemindAjnaReviewPrInput -> Ajna review report
```

Current pure helper:

```ts
buildAjnaGithubPullRequestPayloadFromCollectorSnapshot(snapshot)
```

The helper accepts pull request identity, changed-file summaries, and optional check-run summaries, then emits the payload consumed by `normalizeGithubPullRequestForAjnaReview()`.

## Fixture

Use the committed offline fixture as a contract example:

```text
examples/ajna/github-collector-snapshot.ready.json
```

## Boundary

This contract must remain:

- local-only
- read-only
- deterministic
- provider-free
- network-free
- mutation-free

It must not:

- fetch GitHub API data
- post pull request comments
- approve or request changes
- merge pull requests
- run validation commands
- infer hidden evidence

## Future live adapter rule

A later live adapter may fill this snapshot shape from GitHub, but the adapter must preserve this separation:

1. collect read-only data
2. normalize into the collector snapshot
3. convert into `AjnaGithubPullRequestPayload`
4. render locally through Ajna

No future adapter should bypass the deterministic Ajna review-pr path.

## Do Not Repeat guard

Do not reimplement the payload normalizer from PR #59 or the fixture command from PR #60. This contract only defines the pure upstream snapshot boundary for future ingestion work.
