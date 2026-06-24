# Ajna review-pr live GitHub input plan

This plan defines the next adapter boundary for turning live GitHub pull request context into the existing local Ajna `review-pr` JSON shape.

This is a plan-first document. It intentionally does not add network ingestion, PR comment posting, repository mutation, provider calls, validation command execution, or merge automation.

## Goal

Prepare a future adapter that can collect pull request context and normalize it into the same local evidence contract consumed by:

```bash
codemind ajna review-pr <json-file>
```

The future live adapter should produce a `CodemindAjnaReviewPrInput`-compatible object, then hand it to the existing deterministic renderer path.

## Proposed command surface

```bash
codemind ajna review-pr-github <owner/repo> <pull-number> --out <json-file>
```

Future behavior:

1. Read pull request metadata.
2. Read changed file paths and patch summaries.
3. Read CI status summaries.
4. Write a local JSON evidence file.
5. Ask the operator to run `codemind ajna review-pr <json-file>`.

The command should not render directly in the first live-ingestion PR. Keeping collection and rendering separate makes the boundary easier to test.

## Input contract

The adapter should emit:

```ts
interface CodemindAjnaGithubReviewInputPlan {
  readonly repository: string
  readonly pullRequestNumber: number
  readonly baseRef: string
  readonly headRef: string
  readonly headSha?: string
  readonly changedFiles: readonly string[]
  readonly ciEvidence: readonly string[]
  readonly diffEvidence: readonly string[]
}
```

Then normalize into the existing review-pr JSON shape:

```ts
interface CodemindAjnaReviewPrInput {
  readonly request: AjnaReviewRequest
  readonly findings: readonly AjnaReviewFinding[]
  readonly recommendedNextAction?: string
}
```

## Runtime boundary

The future adapter may read GitHub data only when the operator explicitly invokes it.

It must not:

- post pull request comments
- approve or request changes
- merge pull requests
- push commits
- run shell commands
- call LLM providers
- infer evidence without marking it as inferred

## Validation rules

The adapter must validate that:

- repository is non-empty
- pull request number is a positive integer
- base/head refs are non-empty
- changed files are strings
- CI evidence is represented as summaries, not raw logs by default
- generated JSON passes `parseAjnaReviewPrInput()` before writing success output

## Test plan

A future implementation PR should add tests that prove:

- GitHub payloads normalize into `CodemindAjnaReviewPrInput`
- missing pull request metadata is rejected
- empty changed-file payloads are rejected unless explicitly allowed
- CI evidence is optional but clearly represented when absent
- generated JSON renders through `buildAjnaReviewPrForInput()`
- no mutation-capable GitHub operations are wired

## Do Not Repeat guard

This plan does not replace the local fixture adapter from PR #56 or the example hardening from PR #57. It only defines the next safe boundary for a future read-only GitHub input collector.
