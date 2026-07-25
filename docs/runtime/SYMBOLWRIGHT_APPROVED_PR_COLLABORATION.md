# SymbolWright Approved PR Collaboration

Phase Y adds a fake-client-backed collaboration seam for pull request coordination.

The first Phase Y slice supports the existing allowed GitHub write actions:

```txt
post_comment
apply_label
```

## Safety boundary

This phase still uses the existing GitHub write gate.

Approved execution requires:

```txt
allowGitHubWrites true
github:write approval
a supported action
a target repository
a pull request number
non-empty content
a reason
```

## Default behavior

Dry run mode returns an operation preview and does not call the fake client.

Non-dry-run mode calls only the fake client seam in this PR. It does not make live GitHub API calls by default.

## Out of scope

This phase does not add merges, review approvals, branch deletion, force pushes, workflow reruns, live network ingestion, or live GitHub mutation by default.
