# Ajna client pipeline status command

The `codemind ajna client-pipeline-status` command prints whether the local Ajna client collector fixture pipeline still matches the expected manifest shape.

It checks the three local fixture steps added across the recent Ajna client collector work:

1. collector snapshot fixture
2. review fixture
3. merge-readiness fixture

## Boundary

This command is local manifest status only. It does not read remote data, call a remote service, create comments, or change repository state.
