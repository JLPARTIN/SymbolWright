# SymbolWright Brokered Sandbox Egress

SymbolWright runtime execution remains offline by default. Strong sandbox containers continue to run with container networking disabled. When a mission has a legitimate need to call an external HTTPS endpoint, the request is performed by a separate host-side broker under an operator-owned policy profile. The container is never attached to a general Docker bridge and is never given proxy credentials or raw socket access.

## Security boundary

The egress capability is separate from offline execution and dependency acquisition:

- `symbolwright.sandbox.execute.offline` authorizes isolated execution only.
- `symbolwright.dependencies.acquire` authorizes the governed dependency workflow only.
- `symbolwright.sandbox.egress` authorizes bounded broker requests only.

An egress approval does not change a runner's network policy. The execution broker forces the effective runner to `networkPolicy: disabled` and `capabilities.network: false`, even when runner inventory incorrectly advertises networking.

## Default states

The operator-visible state is one of:

| State             | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `disabled`        | The independent emergency kill switch is active.                                        |
| `dependency-only` | No enabled runtime egress profile exists; normal runtime execution remains offline.     |
| `allowlisted`     | At least one enabled operator-owned egress profile is available.                        |
| `unsupported`     | The current deployment cannot enforce the broker boundary.                              |
| `denied`          | Configuration or authorization failed closed.                                           |
| `quota-exhausted` | A session reached an effective request, byte, duration, redirect, or concurrency limit. |

No policy file means `dependency-only`, not unrestricted access.

## Configuration

Set `SYMBOLWRIGHT_EGRESS_POLICY_FILE` to a JSON file containing an array of profiles. A safe example is provided at `config/egress-policy.example.json`.

```bash
export SYMBOLWRIGHT_EGRESS_POLICY_FILE="$PWD/config/egress-policy.example.json"
```

Each profile is versioned and defines:

- deployment and caller scope;
- exact hosts or constrained wildcard subdomains;
- allowed HTTP methods and request headers;
- HTTPS port 443 only;
- redirect handling;
- audit retention;
- request, body, response, total-byte, duration, concurrency, and redirect limits.

There is no permissive built-in profile. Operators must replace example destinations with real endpoints they control or explicitly trust.

## Approval binding

The server authorization context must contain all of the following:

1. Runtime mode `APPROVED_EXECUTION`.
2. Capability `symbolwright.sandbox.egress`.
3. A current profile reference containing the exact policy ID and version.
4. An operator approval bound to the egress capability and every effective source version.

The approval includes the global egress policy version, selected profile version, relevant grant and mission versions, and request-tightening version. Missing or stale bindings are denied before DNS or network access.

## Network controls

For every request and every redirect hop, the broker:

1. Parses and reauthorizes the HTTPS URL.
2. Rejects URL credentials, direct IP destinations, alternate ports, and disallowed methods or headers.
3. Resolves DNS outside the container.
4. Rejects empty responses, ambiguous or disallowed CNAME pivots, and any answer set containing a forbidden address class.
5. Denies loopback, private, link-local, metadata-service, IPv6 local/private, and IPv4-mapped IPv6 destinations.
6. Selects and pins an approved address into the TLS connection while preserving the original hostname for SNI and certificate verification.
7. Applies response limits while streaming.
8. Rechecks policy revision and emergency controls before and after the request.

Redirects never inherit authority blindly. The destination, DNS result, host scope, method, body, headers, revision, and quotas are reevaluated on every hop.

## Credentials and headers

The first broker release has `credentialPolicy: "none"`. URLs containing credentials are rejected. Credential-bearing and connection-control headers such as `authorization`, `cookie`, `proxy-authorization`, `host`, `forwarded`, `x-forwarded-*`, `connection`, `upgrade`, and `transfer-encoding` are forbidden.

Only headers explicitly listed by the operator profile are admitted. Header names and values are validated against injection and size limits. Redirects strip sensitive headers again as a defense-in-depth control.

## Quotas and cancellation

Limits are intersected so a request may tighten an operator profile but can never widen it. The session enforces:

- total network request count, including redirect hops;
- per-request body and response size;
- total sent and received bytes;
- total session duration;
- maximum concurrent requests;
- maximum redirects.

Cancellation is checked before DNS, after transport, and around policy revision checks. Quota and concurrency decisions are fail-closed and recorded in metrics.

## Revision controls and kill switches

Global controls:

```bash
SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS=true
SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION=2
```

Per-profile live controls use a normalized uppercase policy ID. For a profile named `runtime-api`:

```bash
SYMBOLWRIGHT_EGRESS_POLICY_VERSION_RUNTIME_API=4
SYMBOLWRIGHT_DISABLE_EGRESS_POLICY_RUNTIME_API=true
```

Changing a bound version or activating a kill switch terminates authority for active sessions at the next policy checkpoint. It does not wait for process restart.

## Evidence and metrics

Audit records are redacted at the persistence boundary. They include policy identity and fingerprint, a hash of the session ID, destination hostname, a hash of the path and query, method, decision code, public/forbidden destination class, request count, byte totals, duration, and status code when available.

Audit records do not contain:

- raw session IDs;
- URL paths or query strings;
- request header values;
- request or response bodies;
- authorization tokens, cookies, or proxy credentials;
- resolved IP addresses.

The JSONL audit sink writes append-only records with restrictive file permissions. A persistence failure fails the broker request closed rather than silently losing required evidence.

Metrics expose aggregate active sessions and requests, allowed and denied counts, quota exhaustion, cancellation, policy revocation, and byte totals. They do not expose destinations or credentials.

## Operator checks

Run:

```bash
npm run doctor
```

The report includes `Sandbox egress` with the resolved state and a redacted explanation. The web runtime status view shows the same state. A missing profile is a warning and keeps runtime execution offline; malformed or invalid policy configuration is a failure.

## Verification

Before enabling a production profile, verify:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run build
npm run release-readiness
npm run validate
```

The hostile test matrix covers private and metadata destinations, IPv4 and IPv6 forms, mixed DNS answers, CNAME and redirect pivots, policy revision, cancellation, concurrency races, quota exhaustion, audit redaction, unsafe audit paths, and the invariant that strong-container execution remains network-disabled.

## Non-goals

This release does not provide arbitrary TCP or UDP forwarding, SSH tunneling, general proxying, caller-supplied credentials, direct container sockets, Docker bridge networking, host-network mode, plaintext HTTP, or a fallback that bypasses the broker. Unsupported traffic remains denied rather than silently routed through a weaker execution path.
