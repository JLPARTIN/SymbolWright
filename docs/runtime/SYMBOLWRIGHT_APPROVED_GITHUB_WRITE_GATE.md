# Phase P — Approved GitHub Write Gate

Phase P introduces the approved GitHub write gate, which evaluates whether a GitHub write action would be allowed by policy and approval without executing the action. This gate adds policy enforcement and approval ticket checking on top of the Phase O proposal structure.

## Design

The gate evaluator checks:

1. **Policy** — `allowGitHubWrites` must be enabled in the runtime policy
2. **Approval ticket** — An approval ticket with `github:write` scope is required
3. **Action** — Must be one of the allowed GitHub write actions
4. **Repository** — Target repository must be specified
5. **Target ref** — PR number, issue, or branch must be specified
6. **Content** — Write content must not be empty
7. **Reason** — Why this write is requested

The gate returns `ALLOWED` when all checks pass, or `BLOCKED` with accumulated block reasons.

## Allowed Actions

The allowed GitHub write actions are:

- `create_draft_pr` — Create a draft pull request
- `post_comment` — Post a comment on a PR or issue
- `apply_label` — Apply a label to a PR or issue

Disallowed actions (e.g. `merge_pr`, `force_push`, `delete_branch`) are always blocked.

## Dry-Run Support

When `dryRun` is `true` (the default), the gate previews the decision without executing. When `false`, the gate confirms permission but still does not execute the action — it evaluates permission only.

## Policy Field

Phase P adds `allowGitHubWrites: boolean` to `RuntimePolicySnapshot`. This field defaults to `false` in the default runtime policy, ensuring GitHub writes are disabled unless explicitly enabled by the operator.

## Audit Events

Every evaluation produces a `RuntimeAuditEvent`:

- Action: `github_write_gate`
- Status: `allowed` or `blocked`
- Ticket ID: included when an approval ticket is present
- Detail: includes action type, repository, and reason or block reasons

## CLI Command

```txt
codemind github-write-gate <json-file>
```

The fixture JSON must include:

```json
{
  "action": "create_draft_pr",
  "repository": "owner/repo",
  "targetRef": "main",
  "content": "Phase P: Approved GitHub write gate",
  "reason": "Deliver Phase P",
  "dryRun": true
}
```

## Runtime Tool

The `github_write_gate` tool is registered with capability `GITHUB_WRITE_GATE`. It parses input, evaluates the gate against policy and approval, and returns the combined gate result and audit output.

## Registry

`createGitHubWriteGateRuntimeRegistry()` extends the Phase O GitHub-write-proposal registry with the `github_write_gate` tool, preserving all previous tools in the chain.

## Safety Boundaries

- Approval ticket with `github:write` scope required
- Policy must explicitly enable `allowGitHubWrites`
- Create draft PR, post comment, apply label only — no merge
- No GitHub API calls — this gate evaluates permission only
- Audit event emitted for every evaluation
- Dry-run defaults to true
