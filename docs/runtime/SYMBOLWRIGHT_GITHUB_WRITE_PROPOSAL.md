# Phase O — Governed GitHub Write Proposal

Phase O introduces the GitHub write proposal gate, which creates structured proposals for GitHub write actions without executing them. Proposals describe what a GitHub write would do and evaluate whether the proposed action is in the allowed set.

## Design

The proposal evaluator checks:

1. **Action** — Must be one of the allowed GitHub write actions
2. **Repository** — Target repository must be specified (owner/repo)
3. **Target ref** — PR number, issue, or branch must be specified
4. **Content** — Proposal content must not be empty
5. **Reason** — Why this write is proposed

The evaluator returns `PROPOSED` when all checks pass, or `BLOCKED` with accumulated block reasons.

## Allowed Actions

The allowed GitHub write actions are:

- `create_draft_pr` — Create a draft pull request
- `post_comment` — Post a comment on a PR or issue
- `apply_label` — Apply a label to a PR or issue

Disallowed actions (e.g. `merge_pr`, `force_push`, `delete_branch`) are always blocked at the proposal level.

## Output

When `PROPOSED`, the output includes:

- Action, repository, target ref, reason
- Full proposed content
- Clear `PROPOSAL_ONLY` status indicating no GitHub API call was made

When `BLOCKED`, the output shows the block reasons without the proposed content.

## Audit Events

Every evaluation produces a `RuntimeAuditEvent`:

- Action: `github_write_proposal`
- Status: `allowed` (PROPOSED) or `blocked` (BLOCKED)
- Detail: includes action type, repository, and reason or block reasons

No approval ticket is required for proposals.

## CLI Command

```txt
symbolwright github-write-proposal <json-file>
```

The fixture JSON must include:

```json
{
  "action": "create_draft_pr",
  "repository": "owner/repo",
  "targetRef": "main",
  "content": "Phase O: Add governed GitHub write proposal",
  "reason": "Deliver Phase O"
}
```

## Runtime Tool

The `github_write_proposal` tool is registered with capability `GITHUB_WRITE_PROPOSAL`. It parses input, evaluates the proposal, and returns the combined proposal result and audit output.

## Registry

`createGitHubWriteProposalRuntimeRegistry()` extends the Phase N PR-preparation registry with the `github_write_proposal` tool, preserving all previous tools in the chain.

## Safety Boundaries

- Proposal only — no execution
- No GitHub API calls — no PR creation, no comments, no labels applied
- No push, no merge
- Audit event emitted for every evaluation
- Clear PROPOSAL_ONLY status in all output
