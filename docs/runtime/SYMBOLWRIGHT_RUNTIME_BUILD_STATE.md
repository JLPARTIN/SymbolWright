## Current Runtime Posture

SymbolWright now defaults to direct execution for normal coding-agent workflows. Runtime policy remains responsible for workspace boundaries, protected paths, allowlisted validation commands, sandboxed execution, and destructive-operation safeguards.

The runtime is no longer governed, read-only, or approval-first by default for normal coding-agent work.

# SymbolWright Runtime Build State

This document records the post-Phase T runtime state. All 20 runtime phases are complete.

## Completed bundles

```text
Phase A: COMPLETE — Read-only runtime activation
Phase B: COMPLETE — Proposal mode and operator notes
Phase C: COMPLETE — Bounded read-only runtime loop
Phase D: COMPLETE — Retired approval-ticket dry-run surface
Phase E: COMPLETE — Local PR and workflow read adapters
Phase F: COMPLETE — Live read adapter policy handshake
Phase G: COMPLETE — Live read adapter client seam
Phase H: COMPLETE — Live GitHub read adapter behind policy
Phase I: COMPLETE — Ajna live-read review pipeline
Phase J: COMPLETE — Operator review gate for live outputs
Phase K: COMPLETE — Approved write preparation
Phase L: COMPLETE — Controlled local file write gate
Phase M: COMPLETE — Approved validation command gate
Phase N: COMPLETE — PR preparation from approved local changes
Phase O: COMPLETE — Governed GitHub write proposal
Phase P: COMPLETE — Approved GitHub write gate
Phase Q: COMPLETE — Runtime integration and workflow composition
Phase R: COMPLETE — Read-only Ajna workflow surface
Phase S: COMPLETE — Runtime status dashboard
Phase T: COMPLETE — Approved local file write execution
```

## Active runtime surface

```text
symbolwright help
symbolwright status
symbolwright operator [mission]
symbolwright agent [--mode <mode>] [message]
symbolwright sessions
symbolwright index [dir]
symbolwright plan <goal>
symbolwright read <path>
symbolwright search <query>
symbolwright validation-plan [focus]
symbolwright propose-patch <goal>
symbolwright pr-notes [focus]
symbolwright pr-notes --fixture-file <json-file>
symbolwright ci-review [source]
symbolwright ci-review --fixture-file <json-file>
symbolwright runtime run <goal> --read-only
symbolwright live-read-policy <json-file>
symbolwright live-read-client-fixture <json-file>
symbolwright github-live-read <json-file>
symbolwright ajna-live-read <json-file>
symbolwright operator-review <json-file>
symbolwright write-intent <json-file>
symbolwright local-write <json-file>
symbolwright apply-patch <json-file>
symbolwright validation-command <json-file>
symbolwright pr-preparation <json-file>
symbolwright github-write-proposal <json-file>
symbolwright github-write-gate <json-file>
symbolwright workflow <json-file>
symbolwright ajna-workflow <json-file>
symbolwright runtime-status
symbolwright project-context [dir]
symbolwright scan [dir]
symbolwright ajna scan-profile [dir]
symbolwright ajna docs
symbolwright ajna client-pipeline-manifest
symbolwright ajna client-pipeline-status
symbolwright ajna review-pr <json-file>
symbolwright ajna review-pr-github-fixture <json-file>
symbolwright ajna review-pr-github-api-fixture <json-file>
symbolwright ajna github-api-snapshot-fixture <json-file>
symbolwright ajna client-collector-fixture <json-file>
symbolwright ajna review-pr-client-collector-fixture <json-file>
symbolwright ajna merge-readiness-client-collector-fixture <json-file>
symbolwright ajna review-pr-collector-fixture <json-file>
symbolwright ajna review-pr-readonly-collector-fixture <json-file>
symbolwright ajna github-readonly-collector-fixture <json-file>
symbolwright ajna merge-readiness <json-file>
```

## Retired Phase D surface

```text
symbolwright runtime run <goal> --approval-ticket <id>  retired
apply_edit_gated                                    retired
command_dry_run_gated                              retired
```

The retired Phase D path represented edits and commands without doing useful runtime work. Current workspace mutation and validation use the live write, patch, validation, workflow, agent, and sandbox-backed execution surfaces.

## Next runtime phase

```text
none — all 20 runtime phases are complete
```

All future build work targets the 100% build plan bundles (CM-100-A through CM-100-I), not new runtime phases.
