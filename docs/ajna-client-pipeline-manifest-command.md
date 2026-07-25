# Ajna client pipeline manifest command

The `symbolwright ajna client-pipeline-manifest` command prints the local fixture pipeline for the Ajna client collector bridge.

It lists the three local steps:

1. collector snapshot fixture
2. review fixture
3. merge-readiness fixture

## Related docs

See `docs/ajna-fixture-command-index.md` for the operator quick-start across the local Ajna fixture command surface.

## Boundary

This command is a manifest only. It does not read repository data, call a remote service, create comments, or change repository state.
