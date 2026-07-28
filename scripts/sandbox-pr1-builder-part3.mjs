import { applyOperations } from './sandbox-pr1-builder-lib.mjs'

const operations = [
  {
    type: 'replace',
    file: '.env.example',
    old: `# Opt in to running sandboxed commands directly on the host when no container runtime is
# available. Off by default for a reason — only enable this in an environment you already trust.
SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=
`,
    new: `# Local-operator break-glass only: directly runs trusted code with host language runtimes.
# This is not a strong sandbox, does not isolate host network/filesystem access, is forbidden in
# hosted mode, and is rejected by the HTTP sandbox API and the sandbox_execute agent tool.
# No container failure ever falls back to this path automatically.
SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=
`,
  },
  {
    type: 'replace',
    file: 'src/sandbox/sandbox-registry.ts',
    old: `'Legacy server TypeScript runner is guarded-host and must be routed through Bundle 4 policy before execution.',
`,
    new: `'Legacy server TypeScript execution is trusted local host break-glass, not a strong sandbox.',
`,
  },
  {
    type: 'replace',
    file: 'src/sandbox/sandbox-registry.ts',
    old: `notes: [
  'Guarded-host is not a strong sandbox.',
  'It remains disabled unless APPROVED_EXECUTION and SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true are both present.',
  'No inherited secrets, shell interpolation, arbitrary executable paths, or dependency installation are allowed.',
],
`,
    new: `notes: [
  'Guarded-host is trusted local host execution, not a strong sandbox.',
  'It does not enforce host network or full host filesystem isolation.',
  'It remains disabled unless APPROVED_EXECUTION and SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true are both present.',
  'The HTTP sandbox API and sandbox_execute agent tool reject guarded-host runners.',
  'No inherited secrets, shell interpolation, arbitrary executable paths, or dependency installation are allowed.',
],
`,
  },
  {
    type: 'replace',
    file: 'src/sandbox/sandbox-registry.ts',
    old: 'reason: `${command} was detected, but guarded-host execution is disabled by default.`,\n',
    new: 'reason: `${command} was detected, but trusted local host break-glass execution is disabled by default.`,\n',
  },
  {
    type: 'replace',
    file: 'src/sandbox/sandbox-registry.ts',
    old: `? 'Guarded-host execution is disabled by default.'
: \`Guarded-host execution is disabled by default. Discovery: \${discovered.reason}\`,
`,
    new: `? 'Trusted local host break-glass execution is disabled by default.'
: \`Trusted local host break-glass execution is disabled by default. Discovery: \${discovered.reason}\`,
`,
  },
  {
    type: 'replace',
    file: 'src/sandbox/sandbox-registry.ts',
    old: `'Guarded-host runners require explicit opt-in and APPROVED_EXECUTION before code can run.',
`,
    new: `'Guarded-host runners are trusted local host break-glass only; HTTP and agent-tool execution reject them.',
`,
  },
  {
    type: 'after',
    file: 'CHANGELOG.md',
    anchor: '## [Unreleased]\n\n### Fixed\n',
    text: `- **Sandbox guarded-host truth boundary (Sandbox Bundle PR 1/7)**: reclassifies
  guarded-host as trusted local operator break-glass execution rather than a strong sandbox,
  forbids it in hosted mode and through the HTTP sandbox API or \`sandbox_execute\` agent tool,
  rejects caller-selected repository roots at those boundaries, derives HTTP execution mode
  from server context instead of request JSON, and caps \`bash\` timeout overrides at the server
  maximum. The repository dashboard now waits for a mission-bound strong container runner rather
  than advertising guarded-host as an HTTP-compatible sandbox.
`,
  },
  {
    type: 'replace',
    file: 'src/sandbox/sandbox-policy-coverage.spec.ts',
    old: `expect(guardedBlocked.allowed).toBe(false)
expect(guardedAllowed.allowed).toBe(true)

const unavailable = evaluateSandboxPolicy(
`,
    new: `const guardedHosted = evaluateSandboxPolicy(request(), guarded, {
  mode: 'APPROVED_EXECUTION',
  env: {
    SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true',
    SYMBOLWRIGHT_DEPLOYMENT_MODE: 'hosted',
  },
})
expect(guardedBlocked.allowed).toBe(false)
expect(guardedAllowed.allowed).toBe(true)
expect(guardedAllowed.reason).toContain('break-glass')
expect(guardedHosted.allowed).toBe(false)
expect(guardedHosted.reason).toContain('forbidden in hosted')

const unavailable = evaluateSandboxPolicy(
`,
  },
]

const index = Number(process.argv[2])
if (!Number.isInteger(index) || index < 0 || index >= operations.length) {
  throw new Error(`Provide a builder operation index from 0 to ${operations.length - 1}.`)
}

console.log(`Applying part 3 operation ${index}: ${operations[index].file}`)
await applyOperations([operations[index]])
