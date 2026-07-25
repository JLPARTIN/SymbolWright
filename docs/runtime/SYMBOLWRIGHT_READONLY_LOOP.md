# SymbolWright Read-only Runtime Loop

This document records Phase C bounded read-only runtime loop activation.

## Active command

```text
codemind runtime run <goal> --read-only
```

## Purpose

The read-only runtime loop runs a bounded sequence of safe runtime tools and captures a transcript for operator review.

## Tool sequence

The initial loop uses:

```text
plan_goal
validation_plan
propose_edit
```

## Safety boundary

The loop is intentionally constrained.

It uses only read-only/proposal-mode tools and does not perform file edits, shell execution, network access, provider calls, GitHub writes, PR comments, approvals, or merges.

## Runtime records

The loop captures:

```text
runtime session
runtime transcript
compacted transcript summary
iteration count
final status
```

## Iteration cap

The default sequence completes in three iterations. Lower caps stop the loop with `iteration_limit` before additional tools are invoked.

## Next phase

The next build phase is approval gates and audit trail. Execution should remain disabled unless an explicit approval ticket is present.
