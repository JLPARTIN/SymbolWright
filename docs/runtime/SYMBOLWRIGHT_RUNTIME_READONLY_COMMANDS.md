# SymbolWright Runtime Read-only Commands

This document records Phase A read-only runtime activation.

## Active commands

```text
symbolwright plan <goal>
symbolwright read <path>
symbolwright search <query>
symbolwright validation-plan [focus]
```

## Runtime tools

```text
plan_goal
list_files
read_file
search_files
validation_plan
```

## Boundary

These commands are intentionally read-only.

They only render planning, file reading, file search, and validation guidance for operator review.

They do not perform edits, command execution, network access, provider calls, GitHub write actions, or PR comments.

## Operator flow

```text
1. Use plan to outline the requested work.
2. Use read and search to inspect allowed workspace files.
3. Use validation-plan to prepare the command sequence for operator review.
4. Move to proposal mode only in the next build phase.
```

Approved edit gates, command execution, PR comments, and live adapters remain future phases.
