# CodeMind Approved GitHub PR Creation

Phase X adds the first GitHub pull request creation execution seam.

This phase uses a fake GitHub client so the runtime can prove request sequencing without live repository mutation.

## Runtime behavior

The executor checks the existing GitHub write gate first. It then models these operations:

```txt
create branch
commit files
create draft pull request
```

## Safety boundary

The default policy still blocks GitHub writes.

Approved execution requires:

```txt
allowGitHubWrites true
github:write approval
a valid repository
a base branch
a separate head branch
a PR title
at least one file
```

## Out of scope

This phase does not enable live GitHub API writes by default. It also does not add merge actions, review approvals, workflow reruns, branch deletion, force pushes, or network ingestion.
