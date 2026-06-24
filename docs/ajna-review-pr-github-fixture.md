# Ajna review-pr GitHub fixture command

The `codemind ajna review-pr-github-fixture <json-file>` command renders a local mocked GitHub pull request payload through the existing deterministic Ajna review-pr path.

This command is intentionally local-only. It does not fetch from GitHub, post pull request comments, mutate repositories, call LLM providers, run shell commands, or make merge decisions.

## Usage

```bash
codemind ajna review-pr-github-fixture examples/ajna/github-pr-payload.ready.json
```

The command performs this local-only pipeline:

1. Read a mocked GitHub pull request payload JSON file.
2. Validate and normalize it with `normalizeGithubPullRequestForAjnaReview()`.
3. Convert the payload into `CodemindAjnaReviewPrInput`.
4. Render through the existing `buildAjnaReviewPrForInput()` path.

## Input shape

```json
{
  "repository": "JLPARTIN/CodeMind",
  "pullRequestNumber": 59,
  "baseRef": "main",
  "headRef": "ajna-github-payload-normalizer",
  "headSha": "17ada8661847dddd8ed181267789d3a77d0f37d4",
  "changedFiles": [
    "src/ajna/ajna-github-review-normalizer.ts"
  ],
  "diffEvidence": [
    "The normalizer converts mocked GitHub pull request payloads into Ajna review input."
  ],
  "ciEvidence": [
    "CI completed successfully for the mocked pull request head."
  ]
}
```

## Boundary

The command must remain:

- read-only
- local-file-backed
- deterministic
- provider-free
- network-free
- mutation-free

## Why this exists

This command is the bridge between the pure payload normalizer and the future live GitHub adapter. It proves the normalized payload can render through Ajna without introducing network ingestion yet.

## Do Not Repeat guard

Do not use this command to reimplement `codemind ajna review-pr <json-file>`. The fixture command should only adapt mocked GitHub payloads into the existing review-pr input contract, then reuse the existing renderer.
