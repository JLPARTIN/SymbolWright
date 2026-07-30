# Sandbox Network Gateway Composition

## Status

SymbolWright now exposes governed npm dependency acquisition and governed brokered HTTPS egress
through the authenticated HTTP API, the agent tool registry, and MCP. Strong execution containers
remain offline.

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
  "egressProfiles": [
    {
      "id": "docs-only",
      "version": 1,
      "enabled": true,
      "deploymentModes": ["local", "hosted"],
      "callerKinds": ["operator", "delegated-grant", "team-member"],
      "allowedHosts": ["docs.example.com"],
      "allowedMethods": ["GET", "HEAD"],
      "allowedRequestHeaders": ["accept"],
      "allowedPorts": [443],
      "redirectPolicy": "same-host",
      "credentialPolicy": "none",
      "requireTls": true,
      "auditRetentionDays": 30,
      "limits": {
        "maxRequests": 20,
        "maxRequestBytes": 1048576,
        "maxResponseBytes": 8388608,
        "maxTotalSentBytes": 8388608,
        "maxTotalReceivedBytes": 33554432,
        "timeoutMs": 30000,
        "maxConcurrency": 2,
        "maxRedirects": 3
      }
    }
  ],
  "defaultEgressPolicy": {
    "id": "docs-only",
    "version": 1
  }
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

## Live egress surfaces

Bounded HTTPS requests are brokered the same way, through:

- `sandbox_egress_request` in agent execution;
- MCP tool discovery and invocation (hidden from `tools/list` when no policy is resolvable, and
  re-checked on every `tools/call`);
- `POST /api/sandbox/egress` with a server-resolved `missionId`.

Callers may only supply `url`, `method`, `headers`, `body`, and tightening `limits`. They cannot
supply `sessionId`, `policy`, `policyId`, `policyReference`, `approval`, `authorization`, `grantId`,
`principalId`, `workspaceId`, `missionId`, `stateRoot`, `resolver`, `requester`, `proxy`, or
`pinnedAddress` — the parser rejects the request outright if any of those fields are present.

Delegated callers require `symbolwright.sandbox.egress` (a high-risk capability that can only be
added to a grant through the step-up-gated `explicitHighRiskCapabilities` channel), an explicit
egress policy reference on the grant, and a current single-use approval bound to all active policy
versions. Operator calls require `defaultEgressPolicy`. The legacy trusted-operator `web_fetch` and
`web_search` tools remain a separate, operator-only research surface — they are never advertised to
a delegated caller and always refuse one, so there is exactly one live network path for delegated
work: `sandbox_egress_request`.

Every governed response is redacted before it leaves the broker: the raw final URL (including any
redirect target) is reduced to a hostname, and only a destination hostname plus a path/query hash
are exposed or persisted — never the raw path, query string, or credentials.

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
- `sandbox_egress_policy_profiles`;
- the gateway's redacted egress metrics snapshot (active sessions/requests, allowed/denied
  requests, quota exhaustions, cancellations, policy revocations, bytes sent/received).

## Security invariants

- Network-bearing work stays in host-side brokers.
- Strong execution remains physically offline.
- Policy, approvals, grant identity, and layer paths are server-owned.
- Verified layers are rechecked before use and mounted read-only.
- Missing or invalid authority fails closed.
