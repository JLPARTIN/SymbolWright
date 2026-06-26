# CodeMind Recovery Ledger

Phase AA adds a read-only recovery planning layer.

The recovery ledger records change metadata and renders rollback instructions for operator review.

## What it does

```txt
records changed paths
records change kind
records reason
records rollback note
renders rollback plan
```

## What it does not do

```txt
no file writes
no command execution
no GitHub writes
no branch changes
no pull request changes
no rollback execution
```

Rollback execution must remain a later approved phase behind the same runtime policy gates.
