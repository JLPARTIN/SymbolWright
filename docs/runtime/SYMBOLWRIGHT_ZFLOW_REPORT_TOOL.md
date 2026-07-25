# SymbolWright Zflow Report Tool

PR Bundle AI-AL adds a runtime tool surface for Zflow reports.

## Bundle scope

```txt
AI: Zflow report runtime tool
AJ: Zflow report registry
AK: Report input parsing and validation
AL: Docs and tests
```

## Tool

```txt
name: zflow_report
capability: ZFLOW_REPORT
```

The tool renders an already-produced Zflow result as either markdown or JSON.

## Registry

The report registry is read-only by default:

```txt
allowNetwork false
allowShell false
allowWrites false
allowGitHubWrites false
```

## Safety boundary

This tool is report-only.

It does not:

```txt
execute Zflow
write files
run commands
call GitHub
perform rollback
call providers
```
