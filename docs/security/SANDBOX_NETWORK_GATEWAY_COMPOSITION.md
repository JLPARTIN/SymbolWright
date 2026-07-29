# Sandbox Network Gateway Composition

## Status

This document describes the production composition delivered after the seven-part sandbox bundle.
It does not claim that dependency acquisition or brokered egress is already exposed as an HTTP,
MCP, or agent tool. Those vertical product paths remain separate follow-up slices.

## One application-owned runtime

Each SymbolWright process creates at most one `ApplicationSandboxNetworkRuntime` per resolved
workspace root. The runtime owns the existing `SandboxNetworkGateway`, which in turn owns the
governed npm dependency-acquisition service and the SSRF-resistant HTTPS egress broker.

The unified server composes this runtime during operational startup. The MCP command composes the
same runtime before accepting JSON-RPC input. Server agent turns and autonomous missions execute in
the same process and therefore share the workspace-bound runtime rather than constructing their own
network brokers.

Policy is loaded once for the life of the process. Changing the environment or policy file after
startup does not silently widen authority beneath active work; restart SymbolWright to activate a
new policy revision.

## Offline default

When `SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE` is absent, SymbolWright starts successfully in
`offline-only` mode with zero dependency and egress profiles. Strong execution remains physically
network-disabled. No fallback policy or permissive default is synthesized.

## Operator policy file

Set `SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE` to an absolute path or a path relative to the
workspace root. The target must be a regular, non-symlink file no larger than 1 MiB.

```json
{
  "schemaVersion": 1,
  "dependencyProfiles": [],
  "egressProfiles": []
}
```

The profile shapes are the authoritative `DependencyPolicyProfile` and `EgressPolicyProfile`
contracts in `src/sandbox/dependency-policy.ts` and `src/sandbox/egress-policy.ts`. Their existing
catalog constructors perform the full validation. Invalid JSON, an unsupported schema version,
non-array profile collections, a symlink target, or an invalid profile causes startup to fail.

## State and evidence

The runtime state root is:

```text
<workspace>/.symbolwright/sandbox-network/
```

Dependency cache/evidence and egress audit evidence remain in separate child directories owned by
the existing gateway implementation.

## Readiness and metrics

Operational server preparation records the `sandbox_network_gateway` readiness check. Missing
policy is reported as ready but explicitly `offline-only`; malformed policy prevents startup.

The metrics registry exposes:

- `sandbox_network_configured`
- `sandbox_dependency_policy_profiles`
- `sandbox_egress_policy_profiles`

Request/session/byte metrics continue to come from `SandboxNetworkGateway.egressMetricsSnapshot()`
and will be surfaced by the live egress route/tool slice.

## Security invariants

- Strong containers remain `--network none`.
- Network policy is operator-owned and cannot be supplied by a request or tool call.
- One process does not silently reload or widen policy.
- Missing policy means offline-only, never open internet.
- Invalid policy fails closed before the server or MCP process begins accepting work.
- Dependency acquisition and egress remain host-side broker workflows; they are never implemented
  by attaching a network interface to the execution container.
