# Ajna fixture command index

This page is the operator quick-start for the current local Ajna fixture command surface.

Use it when you need to move from a local fixture request to a collector snapshot, review report, and merge-readiness report without introducing live GitHub ingestion, provider calls, PR comments, or repository mutation.

## Quick path

```text
1. symbolwright ajna client-pipeline-manifest
2. symbolwright ajna client-pipeline-status
3. symbolwright ajna client-collector-fixture <json-file>
4. symbolwright ajna review-pr-client-collector-fixture <json-file>
5. symbolwright ajna merge-readiness-client-collector-fixture <json-file>
```

## Command map

| Need | Command | Output | Doc |
| --- | --- | --- | --- |
| See the local fixture pipeline | `symbolwright ajna client-pipeline-manifest` | Ordered local pipeline manifest | `docs/ajna-client-pipeline-manifest-command.md` |
| Check the local fixture pipeline shape | `symbolwright ajna client-pipeline-status` | Pipeline status report | `docs/ajna-client-pipeline-status-command.md` |
| Produce collector snapshot JSON | `symbolwright ajna client-collector-fixture <json-file>` | Collector snapshot JSON | `docs/ajna-client-collector-fixture-command.md` |
| Produce an Ajna PR review report | `symbolwright ajna review-pr-client-collector-fixture <json-file>` | Ajna review report | `docs/ajna-review-pr-client-collector-fixture-command.md` |
| Produce merge-readiness output | `symbolwright ajna merge-readiness-client-collector-fixture <json-file>` | Ajna merge-readiness report | `docs/ajna-merge-readiness-client-collector-fixture-command.md` |

## Boundary

The current fixture path is intentionally local-first and read-only.

It does not add:

```text
live GitHub ingestion
PR comment posting
provider calls
shell command execution
repository mutation
merge or review actions
```

Future live integrations should remain behind explicit policy gates and operator approval.

## Related docs

```text
docs/ajna-client-pipeline-manifest-command.md
docs/ajna-client-pipeline-status-command.md
docs/ajna-client-collector-fixture-command.md
docs/ajna-review-pr-client-collector-fixture-command.md
docs/ajna-merge-readiness-client-collector-fixture-command.md
```
