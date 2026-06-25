# CodeMind Approved Execution Gates

This document records Phase D approval gates and audit trail activation.

## Active command

```text
codemind runtime run <goal> --approval-ticket <id>
```

## Purpose

Approved execution gates prepare CodeMind for controlled execution without making mutation the default behavior.

## Runtime tools

```text
apply_edit_gated
command_dry_run_gated
```

## Boundary

The Phase D implementation remains conservative.

No approval ticket means hard fail.

Approved tools currently emit dry-run representations only. They do not modify files, execute shell commands, use network access, call providers, write to GitHub, post PR comments, approve reviews, or merge pull requests.

## Protected paths

Protected path enforcement stays active for approved actions. Paths such as `.git`, `.env`, `node_modules`, `dist`, and `coverage` remain blocked.

## Command gate

The command gate only accepts allowlisted validation commands and still does not execute them in this phase.

## Audit trail

Every approved action emits audit output with action, status, ticket, and detail information.

## Next phase

The next build phase is read-only GitHub / PR / CI adapters. Live mutation should remain disabled unless a later explicit operator-approved execution phase enables it.
