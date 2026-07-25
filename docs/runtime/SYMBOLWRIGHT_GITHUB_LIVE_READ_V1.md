# SymbolWright GitHub Live Read Adapter v1

This document describes the v1 live GitHub read adapter, which converts the existing "not yet wired" seam into a real read-only adapter behind policy.

## Architecture

```text
GitHubHttpClient (injectable)
  └── GitHubLiveReadClient (implements RuntimeLiveReadClient)
       └── GitHubLiveReadPolicyWrapper (enforces policy before every read)
            └── Runtime tools (github_live_read_pr, github_live_read_ci)
```

### GitHubHttpClient

An injectable HTTP client interface for GitHub API calls:

- `DefaultGitHubHttpClient` — real HTTP client using `fetch()` with Bearer token auth
- Tests use a `MockGitHubHttpClient` that returns predefined responses

The client only supports `GET` requests. No mutations are possible through this interface.

### GitHubLiveReadClient

Accepts an optional `GitHubHttpClient` at construction:

- **With HTTP client**: Makes real API calls to read PR metadata, changed files, workflow runs, jobs, and file content
- **Without HTTP client**: Throws "not yet wired" errors (backward compatibility with existing tests)

### Redaction

All content flowing through the live read client is redacted via `github-live-read-redaction.ts`:

- GitHub personal access tokens (`ghp_*`)
- GitHub OAuth tokens (`gho_*`)
- Fine-grained PATs (`github_pat_*`)
- API keys (`sk-*`)
- Bearer tokens in content
- Private key markers

## Allowed operations

```text
read PR metadata (title, state, base, head, additions, deletions)
read changed files list
read workflow run summary (name, conclusion)
read workflow jobs (name, status, conclusion)
read repository file content (base64 decoded)
```

## Blocked operations

```text
post comments
approve PRs
request changes
merge PRs
push branches
rerun workflows
edit files
delete files
apply labels
create releases
```

## Policy requirements

Live reads require:

- `allowNetwork=true` in runtime policy
- Explicit read scopes: `pr:read`, `checks:read`, `contents:read`
- Policy wrapper enforces checks before every read operation

## CLI usage

Default mode (fixture/offline):
```text
codemind github-live-read fixtures/github-live-read-fixture.json
```

Live mode (opt-in, requires token):
```text
codemind github-live-read fixtures/github-live-read-fixture.json --live
```

The CLI defaults to fixture/offline mode. Live mode must be explicitly requested.

## Testing

All live-read tests use the `MockGitHubHttpClient` — no real network calls are made in the test suite:

```text
src/runtime/live-read/github-live-read-client.live.spec.ts  — mocked HTTP tests
src/runtime/live-read/github-live-read-client.spec.ts       — existing policy wrapper and tool tests
```

## Implementation

```text
src/runtime/live-read/github-http-client.ts           — injectable HTTP client interface and default implementation
src/runtime/live-read/github-live-read-client.ts       — live read client with optional HTTP injection
src/runtime/live-read/github-live-read-redaction.ts    — content redaction for tokens and secrets
src/runtime/live-read/github-live-read-client.live.spec.ts — mocked HTTP integration tests
```

## Safety posture

- No token is printed to output
- All content is redacted before returning
- HTTP client only supports GET requests
- Policy wrapper blocks any operation not in the allowed scope set
- CLI defaults to offline/fixture mode
- Live mode is opt-in
