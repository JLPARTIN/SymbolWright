import { readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

function insertAfter(path, marker, addition) {
  replaceOnce(path, marker, `${marker}${addition}`)
}

replaceOnce(
  'src/server/symbolwright-chat-server.ts',
  `  const sandboxService = new SandboxService({
    historyStore: new SandboxHistoryStore({ workspaceRoot: cwd, env }),
    env,
  })
`,
  `  const sandboxService = new SandboxService({
    historyStore: new SandboxHistoryStore({ workspaceRoot: cwd, env }),
    workspaceRoot: cwd,
    env,
  })
  void sandboxService.reconcileContainerOrphans().catch(() => undefined)
  shutdownLifecycle.onBeforeShutdown(() => sandboxService.shutdown())
`,
)

insertAfter(
  'src/sandbox/sandbox-policy-model.ts',
  `  readonly trustClass: SandboxTrustClass
`,
  `  readonly container?: {
    readonly engine: 'docker' | 'podman'
    readonly imageId: string
    readonly imageDigest: string
    readonly user: string
    readonly pullPolicy: 'never'
    readonly networkMode: 'none'
    readonly workspaceMode: 'copy-in-tmpfs-copy-out'
  }
`,
)

replaceOnce(
  'src/sandbox/sandbox-policy-model.ts',
  `    trustClass: runner.trustClass,
    allowedLanguageIds,
`,
  `    trustClass: runner.trustClass,
    ...(runner.container === undefined
      ? {}
      : {
          container: {
            engine: runner.container.engine,
            imageId: runner.container.imageId,
            imageDigest: runner.container.digest,
            user: runner.container.user,
            pullPolicy: runner.container.pullPolicy,
            networkMode: runner.container.networkMode,
            workspaceMode: runner.container.workspaceMode,
          },
        }),
    allowedLanguageIds,
`,
)

insertAfter(
  'src/sandbox/sandbox-types.ts',
  `  readonly workspaceMode: 'managed-mission' | 'temporary-copy' | 'trusted-local-host'
`,
  `  readonly container?: {
    readonly engine: 'docker' | 'podman'
    readonly imageId: string
    readonly imageDigest: string
    readonly user: string
    readonly pullPolicy: 'never'
    readonly networkMode: 'none'
    readonly workspaceMode: 'copy-in-tmpfs-copy-out'
  }
`,
)

replaceOnce(
  'src/sandbox/sandbox-evidence.ts',
  `              workspaceMode: policy.workspace.mode,
              sourceVersions: Object.fromEntries(
`,
  `              workspaceMode: policy.workspace.mode,
              ...(policy.container === undefined ? {} : { container: policy.container }),
              sourceVersions: Object.fromEntries(
`,
)

replaceOnce(
  'CHANGELOG.md',
  `### Added

`,
  `### Added

- **Strong offline container executor (Sandbox Bundle PR 3/7)**: adds an opt-in,
  digest-pinned JavaScript container runner with normal-execution \`--pull=never\`, physical
  \`--network none\`, a read-only root filesystem, numeric non-root execution, dropped Linux
  capabilities, no-new-privileges, private PID/IPC namespaces, CPU/memory/PID/tmpfs/time/output
  quotas, symlink-safe copy-in materialization outside the canonical repository, bounded copy-out
  artifact quarantine and patch generation, cancellation, mandatory cleanup, and boot-time orphan
  reaping. No dependency acquisition, runtime egress, arbitrary image selection, repository bind
  mount, or container-to-guarded-host fallback is introduced.

`,
)

replaceOnce(
  'docs/security/SANDBOX_LARGE_PR_BUNDLE_BUILD_PLAN.md',
  `### PR 3 of 7 — Real strong offline container executor
`,
  `### PR 3 of 7 — Real strong offline container executor

**Implementation status:** implemented by PR #336 with a JavaScript-first, digest-pinned,
operator-opt-in backend. Unsupported ecosystems remain fail-closed pending later complete image and
runtime profiles.
`,
)

const workflow = `name: CI

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: \${{ github.workflow }}-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  validate:
    name: Validate SymbolWright
    runs-on: ubuntu-24.04

    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0

      - name: Setup Node.js 22
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Audit dependencies
        run: npm run audit

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: Sandbox runner contract tests
        run: npx vitest run src/runtime/sandbox/sandbox-runner.spec.ts

      - name: Prepare digest-pinned strong sandbox image
        run: docker pull node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66

      - name: Strong sandbox adversarial integration
        env:
          SYMBOLWRIGHT_RUN_STRONG_CONTAINER_INTEGRATION: 'true'
        run: npx vitest run src/sandbox/sandbox-container-integration.spec.ts

      - name: Test with coverage
        run: npm run test:coverage

      - name: Build
        run: npm run build

      - name: Compute changed files for preflight
        run: |
          if [ "\${{ github.event_name }}" = "pull_request" ]; then
            git diff --name-only "origin/\${{ github.event.pull_request.base.ref }}...HEAD" > /tmp/symbolwright-changed-files.txt
          else
            git diff --name-only HEAD~1 HEAD > /tmp/symbolwright-changed-files.txt || true
          fi

      - name: PR preflight
        run: |
          mapfile -t files < /tmp/symbolwright-changed-files.txt
          node dist/cli.js preflight "\${files[@]}"

      - name: Validate
        run: npm run validate
`
writeFileSync('.github/workflows/ci.yml', workflow)
rmSync('scripts/apply-sandbox-pr3-final-patches.mjs')
