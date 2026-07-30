# Sandbox Network Gateway Composition

## Status

SymbolWright now exposes governed npm dependency acquisition through the authenticated HTTP API,
the agent tool registry, and MCP. General brokered HTTPS egress remains a separate follow-up.
Strong execution containers remain offline.

## Application-owned runtime

Each resolved workspace has one process-local `ApplicationSandboxNetworkRuntime`. It owns the
`SandboxNetworkGateway`, dependency evidence/cache/layer state, egress audit state, and durable
workspace-to-layer bindings. Policy is loaded once for the process lifetime; restart SymbolWright to
activate a new revision.

Every production tool call resolves this application-owned runtime through the authorized-tool
chokepoint. The unified server and MCP also compose it before accepting work.

## Offline default

Without `SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE`, startup succeeds in explicit `offline-only`
mode with zero dependency and egress profiles. Dependency acquisition is unavailable, and no
permissive fallback is synthesized.

## Operator policy file

Set `SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE` to an absolute path or a path relative to the
SymbolWright process working directory. The target must be a regular, non-symlink file no larger
than 1 MiB. Relative paths resolve from the process root so server, MCP, and mission workspaces all
observe the same operator authority.

The document must use the authoritative profile contracts from
`src/sandbox/dependency-policy.ts` and `src/sandbox/egress-policy.ts`:

```json
{
  "schemaVersion": 1,
  "dependencyProfiles": [
    {
      "id": "npm-controlled",
      "version": 1,
      "enabled": true,
      "ecosystems": ["npm"],
      "deploymentModes": ["local", "hosted"],
      "callerKinds": ["operator", "delegated-grant", "team-member"],
      "allowedRegistries": ["https://registry.npmjs.org/"],
      "requireLockfile": true,
      "allowLockfileMutation": false,
      "suppressLifecycleScripts": true,
      "directIpDestinations": "denied",
      "cacheNamespace": "npm-controlled",
      "limits": {
        "maxPackages": 100,
        "maxRequests": 200,
        "maxArchiveBytes": 67108864,
        "maxExpandedBytes": 536870912,
        "maxFiles": 100000,
        "maxFileBytes": 33554432,
        "maxTotalBytes": 1073741824,
        "timeoutMs": 300000,
        "maxConcurrency": 4
      }
    }
  ],
  "defaultDependencyPolicy": {
    "id": "npm-controlled",
    "version": 1
  },
  "egressProfiles": []
}
```

Invalid JSON, an unsupported schema version, malformed profiles, a symlink target, or a default
reference that does not select an enabled installed profile prevents startup.

## Live dependency surfaces

The same governed workflow is available through:

- `dependency_acquire` in agent execution;
- MCP tool discovery and invocation;
- `POST /api/sandbox/dependencies/npm` with a server-resolved `missionId`.

Callers may only request tighter registry and quota limits. They cannot provide package manifest
text, host paths, policy references, approvals, grant identity, cache paths, images, or mounts. The
server reads `package.json` and `package-lock.json` from the authorized workspace.

Delegated callers require `symbolwright.dependencies.acquire`, an explicit dependency policy
reference on the grant, and a current single-use approval bound to all active policy versions.
Operator calls require `defaultDependencyPolicy`.

## Evidence and immutable layer

Successful acquisition uses the existing lockfile planner, bounded HTTPS fetcher, integrity checks,
archive inspection, lifecycle-script suppression, cache admission, SBOM generation, and durable
redacted evidence. A verified immutable npm layer is then bound to the authorized workspace or
mission by a server-owned hashed record.

Before execution, the layer is reverified and sealed for non-root use:

- directories: `0555`;
- normal files: `0444`;
- executable files: `0555`.

The only container handoff is a server-selected read-only bind mount:

```text
<verified-layer>/node_modules -> /workspace/node_modules:ro
```

The canonical repository is never mounted. The source workspace remains temporary. Package
lifecycle scripts are not run. The strong container continues to use `--network none`.

## Readiness and metrics

Operational startup reports `sandbox_network_gateway`. Missing policy is ready but explicitly
`offline-only`; malformed policy fails startup. Metrics include:

- `sandbox_network_configured`;
- `sandbox_dependency_policy_profiles`;
- `sandbox_egress_policy_profiles`.

## Security invariants

- Network-bearing work stays in host-side brokers.
- Strong execution remains physically offline.
- Policy, approvals, grant identity, and layer paths are server-owned.
- Verified layers are rechecked before use and mounted read-only.
- Missing or invalid authority fails closed.
