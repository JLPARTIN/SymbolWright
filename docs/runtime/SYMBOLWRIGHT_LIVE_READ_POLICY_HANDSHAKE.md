# SymbolWright Live Read Policy Handshake

This document records Phase F live read adapter policy handshake.

## Active command

```text
codemind live-read-policy <json-file>
```

## Purpose

The policy handshake evaluates whether a proposed live read request would be allowed by SymbolWright policy without performing the live read.

## Input fixture

The JSON fixture describes a proposed live read request:

```json
{
  "provider": "github",
  "purpose": "review pull request evidence",
  "scopes": ["pr:read", "checks:read", "contents:read"],
  "dryRun": true
}
```

## Policy decision

The handshake returns ALLOW or BLOCK based on:

- Provider must be supported (currently: `github`)
- `dryRun` must be `true`
- `purpose` must be non-empty
- All scopes must be in the allowlist

## Allowed scopes

```text
pr:read
checks:read
contents:read
```

## Blocked scopes (examples)

```text
pr:write
checks:write
contents:write
actions:write
workflow:rerun
comments:write
merge
branch:push
```

## Runtime tool

```text
live_read_policy_handshake
```

## Boundary

This phase is dry-run policy evaluation only.

- No live service call is performed
- No comments are posted
- No approvals are submitted
- No merges are performed
- No branches are pushed
- No workflow reruns are requested
