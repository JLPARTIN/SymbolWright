# Ajna client pipeline manifest command

The `codemind ajna client-pipeline-manifest` command prints the local fixture pipeline for the Ajna client collector bridge.

It lists the three local steps:

1. collector snapshot fixture
2. review fixture
3. merge-readiness fixture

## Boundary

This command is a manifest only. It does not read repository data, call a remote service, create comments, or change repository state.
