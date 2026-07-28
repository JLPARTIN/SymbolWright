import { applyOperations } from './sandbox-pr1-builder-lib.mjs'

const operations = [
  {
    "type": "between",
    "file": "src/runtime/tools/sandbox-tools.ts",
    "start": "function asToolRequest(input: unknown, context: RuntimeToolContext): unknown {\n",
    "end": "}\n\nfunction renderExecutionResult",
    "new": "function asToolRequest(input: unknown, context: RuntimeToolContext): unknown {\n  assertNoForbiddenFields(input)\n  if (typeof input !== 'object' || input === null || Array.isArray(input)) {\n    throw new Error('sandbox_execute input must be a structured object request.')\n  }\n  const record = input as Record<string, unknown>\n  const requestedRunnerId = record['requestedRunnerId']\n  if (\n    typeof requestedRunnerId === 'string' &&\n    requestedRunnerId.startsWith(GUARDED_HOST_RUNNER_PREFIX)\n  ) {\n    throw new Error(\n      'sandbox_execute rejects trusted local host runners. Guarded-host is a local operator break-glass path, not an agent/API sandbox.',\n    )\n  }\n\n  const rawRepository = record['repository']\n  let repository: unknown = rawRepository\n  if (typeof rawRepository === 'object' && rawRepository !== null && !Array.isArray(rawRepository)) {\n    const repositoryRecord = rawRepository as Record<string, unknown>\n    if ('rootPath' in repositoryRecord) {\n      throw new Error(\n        'sandbox_execute rejects repository.rootPath because workspace authority comes from the runtime context.',\n      )\n    }\n    repository = {\n      ...repositoryRecord,\n      rootPath: context.cwd,\n    }\n  }\n\n  return {\n    ...record,\n    ...(rawRepository === undefined ? {} : { repository }),\n    ...(record['missionId'] === undefined && context.sessionId !== undefined\n      ? { missionId: context.sessionId }\n      : {}),\n  }\n}\n\nfunction renderExecutionResult"
  },
  {
    "type": "replace",
    "file": "src/runtime/tools/sandbox-tools.ts",
    "old": "  capabilities: runner.capabilities,\n})),\n",
    "new": "  capabilities: runner.capabilities,\n  notes: runner.notes,\n})),\n"
  },
  {
    "type": "replace",
    "file": "src/runtime/tools/sandbox-tools.ts",
    "old": "'Execute, compile, or test code through SymbolWright structured sandbox execution. Accepts only structured sandbox requests; raw shell commands, executable paths, image names, and container args are rejected.',\n",
    "new": "'Execute, compile, or test code through SymbolWright structured sandbox execution. Accepts only structured requests; raw shell commands, caller-selected repository roots, trusted local host runners, image names, and container args are rejected.',\n"
  },
  {
    "type": "replace",
    "file": "src/runtime/tools/bash-tool.ts",
    "old": "DockerSandboxRunner,\nparseWorkspaceCommand,\ntype SandboxRunner,\ntype SandboxRunnerResult,\n",
    "new": "DEFAULT_TIMEOUT_MS,\nDockerSandboxRunner,\nparseWorkspaceCommand,\ntype SandboxRunner,\ntype SandboxRunnerResult,\n"
  },
  {
    "type": "after",
    "file": "src/runtime/tools/bash-tool.ts",
    "anchor": "export interface BashToolInput {\n  readonly command: string\n  readonly timeoutMs?: number\n}\n",
    "text": "function normalizeRequestedTimeout(timeoutMs: number | undefined): number | undefined {\n  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined\n  return Math.min(Math.floor(timeoutMs), DEFAULT_TIMEOUT_MS)\n}\n"
  },
  {
    "type": "replace",
    "file": "src/runtime/tools/bash-tool.ts",
    "old": "const result = await sandboxRunner.runCommand({\n  ...parsedCommand,\n  workspaceRoot: cwd,\n  ...(typeof input.timeoutMs === 'number' ? { timeoutMs: input.timeoutMs } : {}),\n})\n",
    "new": "const timeoutMs = normalizeRequestedTimeout(input.timeoutMs)\nconst result = await sandboxRunner.runCommand({\n  ...parsedCommand,\n  workspaceRoot: cwd,\n  ...(timeoutMs === undefined ? {} : { timeoutMs }),\n})\n"
  },
  {
    "type": "replace",
    "file": "src/app/views/repository-view.ts",
    "old": "return runner.languageIds.indexOf(languageId) >= 0 && runner.availability.status === 'available' && runner.backend !== 'browser';\n",
    "new": "return runner.languageIds.indexOf(languageId) >= 0 && runner.availability.status === 'available' && runner.backend === 'container';\n"
  },
  {
    "type": "replace",
    "file": "src/app/views/repository-view.ts",
    "old": "runBtn.disabled = !repoState.currentFilePath || compatible === null;\nif (!repoState.currentFilePath) statusEl.textContent = 'Open a supported file to run it.';\nelse if (!languageId) statusEl.textContent = 'No server sandbox language is recognized for this file extension.';\nelse if (compatible === null) statusEl.textContent = languageId + ' has no available server runner. Enable SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true or prepare an approved container image.';\nelse statusEl.textContent = 'Ready: ' + languageId + ' via ' + compatible.id + ' (' + compatible.backend + ', ' + compatible.trustClass + ').';\n",
    "new": "runBtn.disabled = !repoState.currentFilePath || compatible === null || !appState.activeMissionId;\nif (!repoState.currentFilePath) statusEl.textContent = 'Open a supported file to run it.';\nelse if (!languageId) statusEl.textContent = 'No server sandbox language is recognized for this file extension.';\nelse if (!appState.activeMissionId) statusEl.textContent = 'Select or create an active mission so the server can resolve the authoritative repository workspace.';\nelse if (compatible === null) statusEl.textContent = languageId + ' has no available strong server container runner. Guarded-host is local break-glass only and cannot run through the HTTP API.';\nelse statusEl.textContent = 'Ready: ' + languageId + ' via ' + compatible.id + ' (' + compatible.backend + ', ' + compatible.trustClass + ').';\n"
  },
  {
    "type": "replace",
    "file": "src/app/views/repository-view.ts",
    "old": "async function runRepoSandbox() {\n  if (!repoState.currentFilePath) return;\n",
    "new": "async function runRepoSandbox() {\n  if (!repoState.currentFilePath || !appState.activeMissionId) return;\n"
  },
  {
    "type": "replace",
    "file": "src/app/views/repository-view.ts",
    "old": "  repository: { rootPath: '.', selectedPaths: [repoState.currentFilePath] },\n  requestedRunnerId: runnerId,\n  stdin: document.getElementById('repo-sandbox-stdin').value,\n  args: repoSandboxArgs(),\n  runtimeMode: 'APPROVED_EXECUTION'\n};\nif (appState.activeMissionId) payload.missionId = appState.activeMissionId;\n",
    "new": "  repository: { selectedPaths: [repoState.currentFilePath] },\n  requestedRunnerId: runnerId,\n  stdin: document.getElementById('repo-sandbox-stdin').value,\n  args: repoSandboxArgs(),\n  missionId: appState.activeMissionId\n};\n"
  },
  {
    "type": "replace",
    "file": "src/agent/tool-schema-bridge.ts",
    "old": "timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default 120000)' },\n",
    "new": "timeoutMs: {\n  type: 'number',\n  description: 'Timeout in milliseconds; requests are capped at the 300000ms server maximum',\n},\n"
  },
  {
    "type": "replace",
    "file": "src/agent/tool-schema-bridge.ts",
    "old": "description: 'Approved repository target with rootPath and selectedPaths',\n",
    "new": "description:\n  'Server-authoritative repository target. Callers may provide selectedPaths only; rootPath is rejected.',\n"
  }
]

await applyOperations(operations)
