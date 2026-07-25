# SymbolWright Workspace Console

This bundle begins the post-CM-200 operator workspace track. It turns the TUI pieces from the Come-Alive phase into a single deterministic workspace render surface that can be embedded by future CLI, web, or CodeMode shells.

## Capability

The workspace console presents one unified operator view:

- mission input
- command history
- agent stream
- active tool console
- HiveMind swarm panel
- Ajna review panel
- approval state
- token/cost/status bar

The renderer is deterministic and does not perform provider calls, shell execution, filesystem mutation, GitHub writes, or approval bypasses.

## Current entry points

- `renderTuiWorkspace(state, options)` renders a full workspace shell from a `TuiState`.
- `renderTuiToolPanel(state)` renders tool execution status.
- `renderWorkspaceCommand(args)` provides a command-rendering adapter for future bin wiring.
- `parseWorkspaceArgs(args)` parses mission text plus `--json` without side effects.

## Next bundle target

The next bundle should safely wire the workspace adapter into the top-level CLI or web CodeMode surface without weakening existing command safety boundaries.
