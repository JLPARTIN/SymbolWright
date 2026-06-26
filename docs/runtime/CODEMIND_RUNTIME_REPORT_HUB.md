# CodeMind Runtime Report Hub

The runtime report hub is the central integration surface for all report layers.

## Hub inputs

The hub accepts:

```txt
indexes     — runtime report indexes with status summaries
notes       — operator-facing summary notes
manifests   — bundle packaging manifests
collections — grouped collections of the above
```

## Hub summary

The hub rolls all surface statuses into one operator summary:

```txt
status            — READY, NEEDS_REVIEW, or BLOCKED
indexCount        — number of indexes
noteCount         — number of notes
manifestCount     — number of manifests
collectionCount   — number of collections
totalSurfaceCount — total across all categories
readyCount        — surfaces with READY status
needsReviewCount  — surfaces needing review
blockedCount      — surfaces that are blocked
```

## Output formats

```txt
markdown — operator-readable summary with sections per surface type
json     — structured hub data for downstream tooling
```

## CLI renderer

The hub CLI reads a JSON fixture and outputs markdown or JSON:

```txt
src/cli-runtime-report-hub.ts
```

Fixture fields:

```txt
title       — required, non-empty string
format      — "markdown" or "json"
indexes     — optional array of index objects
notes       — optional array of note objects
manifests   — optional array of manifest objects
collections — optional array of collection objects
generatedAt — optional ISO timestamp string
```

## Safety boundary

The hub is read-only and report-only.

It does not:

```txt
execute tools
write files
run commands
call GitHub
perform rollback
call providers
access network
```
