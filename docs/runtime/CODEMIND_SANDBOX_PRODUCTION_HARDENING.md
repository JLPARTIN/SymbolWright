# CodeMind Sandbox Production Hardening

CodeMind routes risky local execution through the Docker sandbox runner. The sandbox is designed to stop when Docker is unavailable instead of falling back to direct host execution.

## Runtime boundary

Sandboxed commands use parameterized Docker execution with:

```text
--cap-drop=ALL
--security-opt=no-new-privileges:true
--network none
--memory 512m
--cpus 1
--user node
-v <workspace>:/workspace:rw
-w /workspace
node:22-alpine
```

Workspace writes use a parameterized Node script inside the same Docker boundary. The write script resolves `/workspace`, creates parent directories, blocks path escape, and writes with file mode `0o600`.

## Configuration

The default sandbox configuration works in Codespaces and GitHub-hosted Ubuntu runners that have Docker available.

Optional environment variables:

```bash
CODEMIND_SANDBOX_DOCKER_BINARY=docker
CODEMIND_SANDBOX_IMAGE=node:22-alpine
CODEMIND_SANDBOX_MEMORY=512m
CODEMIND_SANDBOX_CPUS=1
CODEMIND_SANDBOX_NETWORK=none
CODEMIND_SANDBOX_USER=node
CODEMIND_SANDBOX_TIMEOUT_MS=120000
CODEMIND_SANDBOX_MAX_OUTPUT_BYTES=1048576
```

`CODEMIND_SANDBOX_NETWORK` is intentionally constrained to `none`. Do not add network-enabled sandbox execution unless there is a separate reviewed design and tests.

## Doctor diagnostics

Run:

```bash
npm run build
node dist/cli.js doctor
```

Doctor now reports:

```text
Sandbox configuration
Sandbox readiness
```

If Docker is missing or unavailable, the readiness check is a warning in the doctor output. The runtime still blocks sandboxed execution rather than using host execution.

## Codespaces checklist

Use this before validating a PR that changes runtime execution:

```bash
git status --short
npm ci
npm run format:check
npm run typecheck
npm run test:coverage
npm run build
node dist/cli.js doctor
```

If Docker availability is the only sandbox warning, command execution still fails closed by design. Fix Docker availability before expecting sandboxed command execution to run.

## Troubleshooting

Check Docker directly:

```bash
docker version
docker run --rm --network none node:22-alpine node --version
```

Common failures:

```text
Docker command missing       install/start Docker or set CODEMIND_SANDBOX_DOCKER_BINARY
Docker daemon unavailable    start Docker or restart Codespaces
Image missing                docker pull node:22-alpine
Permission denied            verify workspace mount permissions and user setting
Output limit exceeded        raise CODEMIND_SANDBOX_MAX_OUTPUT_BYTES for trusted validation runs
Timeout exceeded             raise CODEMIND_SANDBOX_TIMEOUT_MS for trusted validation runs
```

## Regression rule

Do not add a host fallback path. A sandbox failure must return a blocked result with a clear reason.
