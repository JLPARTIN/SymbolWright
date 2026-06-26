# CodeMind GitHub Write Executor v1

This document describes the GitHub write executor, which wraps the GitHub write gate into a governed executor for allowed GitHub write actions.

## Architecture

```text
GitHubWriteExecutorRequest
  └── GitHubWriteGate (policy + approval check)
       └── GitHubWriteExecutorClient (action dispatch)
            └── GitHubWriteExecutorResult (outcome + audit trail)
```

## Executor behavior

### dryRun=true (default)
- Gate evaluates permission
- No GitHub API call is made
- Returns DRY_RUN outcome with operation description

### dryRun=false with valid approval
- Gate checks policy (allowGitHubWrites) and approval ticket (github:write scope)
- Client executes the action
- Returns EXECUTED outcome with operation summary and resource URL

### Blocked
- Missing approval, wrong scope, GitHub writes disabled, or empty fields
- Returns BLOCKED with accumulated block reasons

## Allowed actions

| Action           | Description                        |
|------------------|------------------------------------|
| `create_draft_pr`| Create a draft pull request        |
| `post_comment`   | Post a comment on a pull request   |
| `apply_label`    | Apply a label to a pull request    |

## CLI usage

```bash
codemind github-write-executor <json-file>
```

## Fixture format

```json
{
  "action": "post_comment",
  "repository": "owner/repo",
  "targetRef": "42",
  "content": "CI passed — all tests green.",
  "reason": "Notify reviewer of CI results",
  "dryRun": true,
  "approval": {
    "ticketId": "GH-WRITE-001",
    "approvedBy": "operator",
    "scopes": ["github:write"]
  }
}
```

## Execution requirements

- `allowGitHubWrites=true` in runtime policy
- Approval ticket with `github:write` scope
- Non-empty action, repository, targetRef, content, and reason
- Action must be in the allowed actions list

## Client seam

The executor accepts a `GitHubWriteExecutorClient` interface for testability:

```typescript
interface GitHubWriteExecutorClient {
  execute(input: {
    action: GitHubWriteExecutorAction
    repository: string
    targetRef: string
    content: string
  }): Promise<GitHubWriteExecutorClientResult>
}
```

The `FakeGitHubWriteExecutorClient` records operations for testing without making real API calls.

## Safety posture

- All actions gated by policy and approval
- Dry-run by default — no GitHub API calls without explicit opt-in
- Allowed actions restricted to safe collaboration operations
- Arbitrary actions blocked
- Operation audit trail with elapsed time tracking
- Recommended next action provided for every outcome

## Implementation

```text
src/runtime/github-write/github-write-executor.ts              — executor engine
src/runtime/github-write/github-write-executor.spec.ts          — unit tests
src/runtime/github-write/fake-github-write-executor-client.ts   — fake client for testing
src/cli-github-write-executor.ts                                — CLI handler
fixtures/github-write-executor-fixture.json                     — example fixture
```
