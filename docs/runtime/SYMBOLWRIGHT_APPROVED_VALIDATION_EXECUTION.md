# SymbolWright Approved Validation Command Execution

This document describes the validation command executor, which turns the existing validation command gate into a safe, governed executor for allowlisted commands.

## Architecture

```text
ValidationCommandRequest
  └── ValidationCommandGate (policy + approval + allowlist check)
       └── ValidationCommandRunner (spawnSync execution)
            └── ValidationCommandExecutor (redaction + transcript + diagnostics)
                 └── CiDiagnostics (pattern-based failure analysis)
```

## Executor behavior

### dryRun=true (default)
- Gate evaluates permission
- No command is executed
- Returns DRY_RUN outcome

### dryRun=false with valid approval
- Gate checks policy, approval ticket (command:validate scope), and allowlist
- Command executes via spawnSync with restricted env (PATH, NODE_ENV only)
- Output is captured, redacted, and transcribed
- CI diagnostics analyze output for known failure patterns
- Returns PASS, FAIL, or ERROR outcome

### Blocked
- Missing approval, wrong scope, shell disabled, or command not in allowlist
- Returns BLOCKED with accumulated block reasons

## Allowlisted commands

```text
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run audit
npm run build
npm run build:app
```

## Execution requirements

- `allowShell=true` in runtime policy
- Approval ticket with `command:validate` scope
- Reason provided
- Command in the allowlist (no chained commands, no arbitrary shell)

## Execution captures

- Exit code
- Redacted stdout/stderr (secrets, tokens, env paths scrubbed)
- Elapsed time in milliseconds
- Transcript with block reasons and recorded timestamp
- Recommended next action based on outcome
- CI diagnostic findings with severity, source, and suggested fix

## Output redaction

The validation output redactor removes:
- GitHub tokens (ghp_, gho_, github_pat_)
- API keys (sk-*)
- Secret-looking env vars
- Bearer tokens
- Private key markers
- Home directory paths

## CI diagnostics

Pattern-based analysis of validation output:
- TypeScript errors (error TS*)
- Missing modules
- Test failures (FAIL, assertion errors)
- Lint violations (ESLint rules)
- Audit vulnerabilities
- Build errors (module not found, file not found)
- Deduplication of findings per source

## Safety posture

- Arbitrary shell is always blocked
- Chained commands (&&, ||, ;, |) are blocked by the allowlist
- Environment printing is blocked (restricted env)
- Path traversal is not possible (commands run in specified cwd)
- Secret-looking output is redacted
- Timeout enforced at 2 minutes

## Implementation

```text
src/runtime/validation/validation-command-executor.ts       — executor wrapper with redaction and transcript
src/runtime/validation/validation-command-executor.spec.ts  — unit tests
src/runtime/validation/validation-command-transcript.ts     — transcript types and builder
src/runtime/validation/validation-output-redactor.ts        — secret/env redaction
src/runtime/ci/ci-diagnostics.ts                            — pattern-based CI failure analysis
src/runtime/ci/ci-diagnostics.spec.ts                       — unit tests
```
