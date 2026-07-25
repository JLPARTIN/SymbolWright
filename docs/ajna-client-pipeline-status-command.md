# Ajna client pipeline status command

The `symbolwright ajna client-pipeline-status` command prints whether the local Ajna client collector fixture pipeline still matches the expected manifest shape.

It checks the three local fixture steps added across the recent Ajna client collector work:

1. collector snapshot fixture
2. review fixture
3. merge-readiness fixture

## Related docs

See `docs/ajna-fixture-command-index.md` for the operator quick-start across the local Ajna fixture command surface.

## Boundary

This command is local manifest status only. It does not read remote data, call a remote service, create comments, or change repository state.
