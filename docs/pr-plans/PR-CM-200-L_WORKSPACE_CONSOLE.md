# PR-CM-200-L — CodeMind Workspace Console

## Objective

Advance CodeMind beyond the CM-200 A–K Come-Alive merge by creating a deterministic operator workspace render surface.

## Scope

- Add full workspace rendering around the existing TUI state model.
- Add a tool console panel.
- Add a side-effect-free command adapter for future CLI/web CodeMode wiring.
- Add tests for mission input, command history, stream, tools, HiveMind, Ajna, and approval states.
- Document the workspace console boundary.

## Safety boundary

This PR does not invoke providers, execute shell commands, write files at runtime, create GitHub writes, request approvals, or alter existing CLI command routing.

## Follow-up

The next bundle should wire this workspace adapter into a real top-level CodeMode/CLI/web surface after CI validates the deterministic render layer.
