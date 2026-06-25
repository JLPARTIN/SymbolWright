# CodeMind plan command

The `codemind plan <goal>` command renders a non-mutating implementation plan for an operator-provided goal.

## Usage

```bash
codemind plan "add guarded patch proposal"
```

## Output

The command prints:

```txt
CodeMind plan
Goal
Posture
Implementation steps
Suggested validation
Boundary
```

## Boundary

This command is intentionally plan-first and non-mutating.

It does not:

```txt
edit files
run shell commands
call providers
post PR comments
mutate GitHub state
```

Future patch proposal and approved-edit commands should remain separate from this planning command and stay behind explicit operator approval.
