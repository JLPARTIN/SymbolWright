# PR-CM-200-M — Workspace Executable Wiring

CM-200-M begins wiring the validated workspace console into an operator-callable surface.

This bundle adds a standalone workspace executable source entrypoint backed by the deterministic `renderWorkspaceCommand` adapter.

The `codemind workspace [mission]` router alias remains a follow-up because the large CLI router should be edited in a focused bundle after this executable path is validated.
