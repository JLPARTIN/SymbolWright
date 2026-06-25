# CodeMind GitHub Live Read Adapter

This document records Phase H GitHub live read adapter behind policy.

## Active command

```text
codemind github-live-read <json-file>
```

## Purpose

The GitHub live read adapter provides policy-gated read-only access to GitHub PR and CI evidence. All reads pass through the `GitHubLiveReadPolicyWrapper` which enforces scope checks before delegating to the inner client.

## Architecture

```text
CLI fixture -> GitHubLiveReadPolicyWrapper -> RuntimeLiveReadClient -> evidence pipeline -> Ajna bridge
```

### Key classes

- `GitHubLiveReadClient` — real GitHub adapter seam (not yet wired to live network)
- `GitHubLiveReadPolicyWrapper` — enforces policy checks before every read
- `FakeLiveReadClient` — used in all unit tests

### Dependency injection

The registry creates tools with an injected client instance. Unit tests use the fake client through the policy wrapper, proving the adapter layer works without requiring live credentials.

## Allowed operations

```text
read PR metadata (pr:read)
read changed files list (pr:read)
read check/workflow summary (checks:read)
read file content by path/ref (contents:read)
```

## Forbidden operations

```text
post comments
approve reviews
request changes
merge
close/reopen PRs
push branches
rerun workflows
edit files
delete files
write labels
write assignees
```

## Runtime tools

```text
github_live_read_pr
github_live_read_ci
```

## Fixture shape

```json
{
  "mode": "pr",
  "owner": "owner",
  "repo": "repo",
  "prNumber": 42,
  "clientData": {
    "pr": { "number": 42, "title": "Example", "state": "open", "merged": false, "base": "main", "head": "feat/x", "changedFiles": [], "additions": 0, "deletions": 0 }
  }
}
```

## Boundary

- Policy check required before every read
- No live network calls yet (GitHubLiveReadClient throws not-yet-wired)
- No comments are posted
- No approvals are submitted
- No merges are performed
- No branches are pushed
- No workflow reruns are requested
