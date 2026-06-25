# CodeMind Read Adapters

This document records Phase E local fixture read adapters.

## Active commands

```text
codemind pr-notes --fixture-file <json-file>
codemind ci-review --fixture-file <json-file>
```

## Purpose

The adapters turn local pull request and workflow fixture payloads into runtime evidence summaries and Ajna bridge notes.

## Runtime tools

```text
github_pr_fixture_review
github_ci_fixture_review
```

## Boundary

This phase remains read-only and local-fixture based.

It does not use live services or mutate repository state.

## Fixture shape

The fixture may include a `pr` object, a `ci` object, or both.

A future live adapter can replace the fixture source after policy controls are explicit.
