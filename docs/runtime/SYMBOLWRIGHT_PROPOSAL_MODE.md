# CodeMind Proposal Mode

This document records Phase B proposal-mode activation.

## Active commands

```text
codemind propose-patch <goal>
codemind pr-notes [focus]
codemind ci-review [source]
```

## Runtime tools

```text
propose_edit
pr_notes
ci_review
```

## Purpose

Proposal mode gives CodeMind useful coding-agent output without applying changes.

It can render:

```text
patch proposals
PR notes drafts
local CI review drafts
```

## Boundary

Proposal mode does not edit files, run shell commands, call providers, post PR comments, approve reviews, merge pull requests, or write to GitHub.

`ci-review` is local/operator-context only in this phase.

## Ajna critique bridge

The deterministic Ajna bridge checks proposal text for basic safety and completeness signals, including whether a proposal identifies itself as proposal-only and whether planning output includes boundaries and validation.

## Next phase

The next build phase is the bounded read-only runtime loop. It should use the read-only and proposal-mode tools while enforcing iteration caps and transcript capture.
