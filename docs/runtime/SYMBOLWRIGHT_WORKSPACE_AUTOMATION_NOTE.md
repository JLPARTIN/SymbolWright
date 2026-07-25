# Workspace Bundle Automation Note

Operator instruction accepted: after a PR bundle receives green CI and is merged, the next bundle may begin automatically without waiting for another proceed message.

## Guardrails

- Start from the latest `main` after the merge.
- Check for open PRs before creating the next bundle.
- Keep each bundle aligned to the current build plan or the next logical capability gap.
- Do not merge, enable auto-merge, delete branches, force push, or bypass approval gates.
- If CI is red, repair only the failing bundle before starting a new one.

## Current sequence

- CM-200 A–K: merged in PR #149.
- CM-200-L: workspace console render layer and command adapter.
- Next candidate after CM-200-L: top-level CodeMode/CLI/web workspace wiring after CI validates the deterministic render layer.
