# Sandbox Network Gateway Composition

## Status

This document describes the application-owned network composition delivered after the seven-part
sandbox bundle. Governed npm dependency acquisition is now exposed through the authenticated HTTP,
agent, and MCP surfaces. Brokered general HTTPS egress remains a separate follow-up slice.

## One application-owned runtime

Each SymbolWright process creates at most one `ApplicationSandboxNetworkRuntime` per resolved
workspace root. The runtime owns the existing `SandboxNetworkGateway`, which in turn owns the
governed npm dependency-acquisition service and the SSRF-resistant HTTPS egress broker.

The unified server composes this runtime during operational startup. The MCP command composes the
same runtime before accepting JSON-RPC input. Every production tool call also resolves the same
workspace-owned runtime at the authorized-tool chokepoint rather than constructing another network
broker.

Policy is loaded once for the life of the process. Changing the environment or policy file after
startup does not silently widen authority beneath active work; restart SymbolWright to activate a
new policy revision.

## Offline default

When `SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE` is absent, SymbolWright starts successfully in
`offline-only` mode with zero dependency and egress profiles. Strong execution remains physically
network-disabled. No fallback policy or permissive default is synthesized. Dependency acquisition
is unavailable until an operator installs a profile and selects a default.

## Operator policy file

Set `SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE` to an absolute path or a path relative to the
workspace root. The target must be a regular, non-symlink file no larger than 1 MiB.

```json
{
  "schemaVersion": 1,
  "dependencyProfiles": [
    {
      "id": "npm-controlled",
      "version": 1,
      "enabled": true,
      "allowedRegistries": ["https://registry.npmjs.org"],
      "allowedPackages": ["@example/*", "typescript"],
      "deniedPackages": [],
      "allowGitDependencies": false,
      "allowLocalDependencies": false,
      "allowLifecycleScripts": false,
      "limits": {
        "maxPackages": 100,
        "maxRequests": 200,
        "maxArchiveBytes": 104857600,
        "maxExpandedBytes": 524288000,
        "maxFiles": 50000,
        "maxFileBytes": 52428800,
        "maxTotalBytes": 524288000,
        "timeoutMs": 300000,
        "maxConcurrency": 4
      },
      "requireIntegrity": true,
      "requireLockfile": true,
      "evidenceRequired": true
    }
  ],
  "defaultDependencyPolicy": { "id": "npm-controlled", "version": 1 },
  "egressProfiles": []
}
```

The profile shapes are the authoritative `DependencyPolicyProfile` and `EgressPolicyProfile`
contracts in `src/sandbox/dependency-policy.ts` and `src/sandbox/egress-policy.ts`. Their catalog
constructors perform the full validation. Invalid JSON, an unsupported schema version, non-array
profile collections, a symlink target, an invalid profile, or a default dependency reference that
does not match an enabled installed profile causes startup to fail.

## Live dependency surfaces

The same governed operation is available through:

- the `dependency_acquire` agent tool;
- MCP tool discovery and invocation;
- `POST /api/sandbox/dependencies/npm` with a server-resolved `missionId`.

Callers may only request tighter registry and quota limits. They cannot submit package manifests,
filesystem paths, policy references, approval bindings, grant identity, cache paths, image names,
or dependency mounts. The server reads `package.json` and `package-lock.json` from the authorized
mission workspace and derives every authority field itself.

Delegated callers require `symbolwright.dependencies.acquire`, an explicit dependency policy
reference on the grant, and a current single-use approval bound to all active policy versions.
Operator use requires the configured `defaultDependencyPolicy`.

## State and evidence

The runtime state root is:

```text
<workspace>/.symbolwright/sandbox-network/
```

Dependency cache, acquisition evidence, immutable layers, workspace bindings, and egress audit
evidence remain in separate child directories owned by the application runtime. Mission timelines
receive redacted acquisition outcomes and layer hashes rather than package contents or host paths.

## Offline execution handoff

A completed acquisition is materialized from verified cache artifacts into an immutable npm layer.
The layer is bound to the authorized workspace or mission by a server-owned hashed record. During a
later strong-container execution, SymbolWright resolves and verifies that binding and carries it
through a concurrency-safe execution context.

The only container handoff is a read-only bind mount:

```text
<verified layer>/node_modules -> /workspace/node_modules:ro
```

The source workspace remains temporary, the canonical repository is never mounted, lifecycle
scripts are never run, and the execution container still uses `--network none`.

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
- Dependency layers are server-selected, verified, and mounted read-only.
- Network policy is operator-owned and cannot be supplied by a request or tool call.
- One process does not silently reload or widen policy.
- Missing policy means offline-only, never open internet.
- Invalid policy fails closed before the server or MCP process begins accepting work.
- Dependency acquisition and egress remain host-side broker workflows; they are never implemented
  by attaching a network interface to the execution container.
