import { applyOperations } from './sandbox-pr1-builder-lib.mjs'

const operations = [
  {
    "type": "replace",
    "file": ".env.example",
    "old": "# Opt in to running sandboxed commands directly on the host when no container runtime is\n# available. Off by default for a reason — only enable this in an environment you already trust.\nSYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=\n",
    "new": "# Local-operator break-glass only: directly runs trusted code with host language runtimes.\n# This is not a strong sandbox, does not isolate host network/filesystem access, is forbidden in\n# hosted mode, and is rejected by the HTTP sandbox API and the sandbox_execute agent tool.\n# No container failure ever falls back to this path automatically.\nSYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-registry.ts",
    "old": "'Legacy server TypeScript runner is guarded-host and must be routed through Bundle 4 policy before execution.',\n",
    "new": "'Legacy server TypeScript execution is trusted local host break-glass, not a strong sandbox.',\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-registry.ts",
    "old": "notes: [\n  'Guarded-host is not a strong sandbox.',\n  'It remains disabled unless APPROVED_EXECUTION and SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true are both present.',\n  'No inherited secrets, shell interpolation, arbitrary executable paths, or dependency installation are allowed.',\n],\n",
    "new": "notes: [\n  'Guarded-host is trusted local host execution, not a strong sandbox.',\n  'It does not enforce host network or full host filesystem isolation.',\n  'It remains disabled unless APPROVED_EXECUTION and SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true are both present.',\n  'The HTTP sandbox API and sandbox_execute agent tool reject guarded-host runners.',\n  'No inherited secrets, shell interpolation, arbitrary executable paths, or dependency installation are allowed.',\n],\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-registry.ts",
    "old": "reason: `${command} was detected, but guarded-host execution is disabled by default.`,\n",
    "new": "reason: `${command} was detected, but trusted local host break-glass execution is disabled by default.`,\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-registry.ts",
    "old": "? 'Guarded-host execution is disabled by default.'\n: `Guarded-host execution is disabled by default. Discovery: ${discovered.reason}`,\n",
    "new": "? 'Trusted local host break-glass execution is disabled by default.'\n: `Trusted local host break-glass execution is disabled by default. Discovery: ${discovered.reason}`,\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-registry.ts",
    "old": "'Guarded-host runners require explicit opt-in and APPROVED_EXECUTION before code can run.',\n",
    "new": "'Guarded-host runners are trusted local host break-glass only; HTTP and agent-tool execution reject them.',\n"
  },
  {
    "type": "after",
    "file": "CHANGELOG.md",
    "anchor": "### Fixed\n",
    "text": "- **Sandbox guarded-host truth boundary (Sandbox Bundle PR 1/7)**: reclassifies\n  guarded-host as trusted local operator break-glass execution rather than a strong sandbox,\n  forbids it in hosted mode and through the HTTP sandbox API or `sandbox_execute` agent tool,\n  rejects caller-selected repository roots at those boundaries, derives HTTP execution mode\n  from server context instead of request JSON, and caps `bash` timeout overrides at the server\n  maximum. The repository dashboard now waits for a mission-bound strong container runner rather\n  than advertising guarded-host as an HTTP-compatible sandbox.\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-policy-coverage.spec.ts",
    "old": "expect(guardedBlocked.allowed).toBe(false)\nexpect(guardedAllowed.allowed).toBe(true)\n\nconst unavailable = evaluateSandboxPolicy(\n",
    "new": "const guardedHosted = evaluateSandboxPolicy(request(), guarded, {\n  mode: 'APPROVED_EXECUTION',\n  env: {\n    SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION: 'true',\n    SYMBOLWRIGHT_DEPLOYMENT_MODE: 'hosted',\n  },\n})\nexpect(guardedBlocked.allowed).toBe(false)\nexpect(guardedAllowed.allowed).toBe(true)\nexpect(guardedAllowed.reason).toContain('break-glass')\nexpect(guardedHosted.allowed).toBe(false)\nexpect(guardedHosted.reason).toContain('forbidden in hosted')\n\nconst unavailable = evaluateSandboxPolicy(\n"
  }
]

await applyOperations(operations)
