# CodeMind Live Read Client Seam

This document records Phase G live read adapter client seam.

## Active command

```text
codemind live-read-client-fixture <json-file>
```

## Purpose

The client seam introduces a provider-neutral `RuntimeLiveReadClient` interface that future live adapters can implement. Phase G uses a `FakeLiveReadClient` only.

## Interface

```text
RuntimeLiveReadClient
  getPullRequestEvidence(owner, repo, prNumber) -> GitHubPrEvidence
  getWorkflowEvidence(owner, repo, runId) -> GitHubCiEvidence
  getRepositoryFile(owner, repo, path, ref) -> RepositoryFileResult
```

## Fixture shape

The fixture describes a request with embedded fake client data:

```json
{
  "owner": "test-owner",
  "repo": "test-repo",
  "prNumber": 42,
  "workflowRunId": 1001,
  "filePath": "README.md",
  "fileRef": "main",
  "clientData": {
    "pr": { "number": 42, "title": "Example", "state": "open", "merged": false, "base": "main", "head": "feat/x", "changedFiles": [], "additions": 0, "deletions": 0 },
    "ci": { "workflow": "CI", "conclusion": "success", "jobs": [] },
    "files": [{ "path": "README.md", "ref": "main", "content": "# Example" }]
  }
}
```

## Evidence pipeline integration

Fake client evidence passes through:

1. `buildPrEvidenceSummary` / `buildCiEvidenceSummary`
2. `bridgeRuntimeEvidenceToAjna`

This proves the client seam is compatible with the existing evidence pipeline.

## Runtime tool

```text
live_read_client_fixture
```

## Boundary

This phase uses a fake client only.

- No live service call is performed
- No comments are posted
- No approvals are submitted
- No merges are performed
- No branches are pushed
- No workflow reruns are requested
