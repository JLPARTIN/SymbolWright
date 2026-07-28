import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

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
  `## [Unreleased]

### Added

`,
  `## [Unreleased]

### Added

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

let workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
workflow = workflow.replace('permissions:\n  contents: write', 'permissions:\n  contents: read')
workflow = workflow.replace(`        with:\n          ref: \${{ github.head_ref }}\n          fetch-depth: 0`, `        with:\n          fetch-depth: 0`)
workflow = workflow.replace(
  /\n      - name: Apply guarded PR3 final patches[\s\S]*?\n      - name: Audit dependencies/,
  '\n      - name: Audit dependencies',
)
writeFileSync('.github/workflows/ci.yml', workflow)
if (existsSync('sandbox-pr3-patch-diagnostic.txt')) rmSync('sandbox-pr3-patch-diagnostic.txt')
rmSync('scripts/apply-sandbox-pr3-final-patches.mjs')
