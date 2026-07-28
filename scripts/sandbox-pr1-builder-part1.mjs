import { applyOperations } from './sandbox-pr1-builder-lib.mjs'

const operations = [
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-policy.ts",
    "old": "function guardedHostEnabled(env: NodeJS.ProcessEnv): boolean {\n  return env['SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION'] === 'true'\n}\n",
    "new": "function guardedHostEnabled(env: NodeJS.ProcessEnv): boolean {\n  return env['SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION'] === 'true'\n}\n\nfunction hostedDeployment(env: NodeJS.ProcessEnv): boolean {\n  return env['SYMBOLWRIGHT_DEPLOYMENT_MODE']?.trim().toLowerCase() === 'hosted'\n}\n"
  },
  {
    "type": "replace",
    "file": "src/sandbox/sandbox-policy.ts",
    "old": "if (runner.trustClass === 'guarded-host') {\n  if (!guardedHostEnabled(env)) {\n    return {\n      allowed: false,\n      reason:\n        'Guarded-host execution is disabled. Set SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true to opt in.',\n    }\n  }\n  return {\n    allowed: true,\n    reason: 'Approved guarded-host execution; not a strong sandbox.',\n  }\n}\n",
    "new": "if (runner.trustClass === 'guarded-host') {\n  if (hostedDeployment(env)) {\n    return {\n      allowed: false,\n      reason:\n        'Trusted local host execution is forbidden in hosted deployment mode. Use a strong container backend instead.',\n    }\n  }\n  if (!guardedHostEnabled(env)) {\n    return {\n      allowed: false,\n      reason:\n        'Trusted local host execution is disabled. Set SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION=true only for an explicit local operator break-glass session.',\n    }\n  }\n  return {\n    allowed: true,\n    reason:\n      'Operator-approved trusted local host break-glass execution; not a sandbox and not host-network/filesystem isolated.',\n  }\n}\n"
  },
  {
    "type": "replace",
    "file": "src/app/api/sandbox-routes.ts",
    "old": "const MAX_SANDBOX_REQUEST_BYTES = 512 * 1024\nconst RUNTIME_MODES: readonly SymbolWrightRuntimeMode[] = [\n  'PLAN_ONLY',\n  'READ_ONLY',\n  'PROPOSAL_ONLY',\n  'APPROVED_EXECUTION',\n]\n",
    "new": "const MAX_SANDBOX_REQUEST_BYTES = 512 * 1024\n"
  },
  {
    "type": "replace",
    "file": "src/app/api/sandbox-routes.ts",
    "old": "  readonly callerGrantId?: string\n  readonly callerPrincipalId?: string\n}\n",
    "new": "  readonly callerGrantId?: string\n  readonly callerPrincipalId?: string\n  /** Server-derived runtime mode. Request JSON is never allowed to elevate this value. */\n  readonly runtimeMode?: SymbolWrightRuntimeMode\n}\n"
  },
  {
    "type": "replace",
    "file": "src/app/api/sandbox-routes.ts",
    "old": "function parseRuntimeMode(record: Record<string, unknown>): SymbolWrightRuntimeMode {\n  const value = record['runtimeMode'] ?? record['modePolicy'] ?? 'APPROVED_EXECUTION'\n  if (typeof value !== 'string' || !(RUNTIME_MODES as readonly string[]).includes(value)) {\n    throw new SandboxRequestValidationError(\n      'runtimeMode must be a supported SymbolWright runtime mode',\n    )\n  }\n  return value as SymbolWrightRuntimeMode\n}\n\n",
    "new": ""
  },
  {
    "type": "after",
    "file": "src/app/api/sandbox-routes.ts",
    "anchor": "function asRecord(value: unknown): Record<string, unknown> {\n  if (typeof value !== 'object' || value === null || Array.isArray(value)) {\n    throw new SandboxRequestValidationError('Sandbox request body must be a JSON object')\n  }\n  return value as Record<string, unknown>\n}\n",
    "text": "function requestedMissionId(record: Record<string, unknown>): string | undefined {\n  const value = record['missionId']\n  if (value === undefined) return undefined\n  if (typeof value !== 'string') {\n    throw new SandboxRequestValidationError('missionId must be a string')\n  }\n  return value\n}\n\nfunction requestsTrustedLocalHost(record: Record<string, unknown>): boolean {\n  const requestedRunnerId = record['requestedRunnerId']\n  return (\n    typeof requestedRunnerId === 'string' && requestedRunnerId.startsWith('guarded-host-')\n  )\n}\n\nfunction bindRepositoryToMissionWorkspace(\n  record: Record<string, unknown>,\n  missionWorkspaceRoot: string | undefined,\n): Record<string, unknown> {\n  const rawRepository = record['repository']\n  if (rawRepository === undefined) return record\n  if (typeof rawRepository !== 'object' || rawRepository === null || Array.isArray(rawRepository)) {\n    return record\n  }\n  const repository = rawRepository as Record<string, unknown>\n  if ('rootPath' in repository) {\n    throw new SandboxRequestValidationError(\n      'repository.rootPath is server-controlled and must not be supplied by the caller',\n    )\n  }\n  if (missionWorkspaceRoot === undefined) {\n    throw new SandboxRequestValidationError(\n      'Repository sandbox execution requires a missionId bound to a server-managed workspace',\n    )\n  }\n  return {\n    ...record,\n    repository: {\n      ...repository,\n      rootPath: missionWorkspaceRoot,\n    },\n  }\n}\n"
  },
  {
    "type": "between",
    "file": "src/app/api/sandbox-routes.ts",
    "start": "      const record = asRecord(await readJsonBody(req))\n",
    "end": "      sendJson(res, 200, { result })\n",
    "new": "const record = asRecord(await readJsonBody(req))\nif (requestsTrustedLocalHost(record)) {\n  sendJson(res, 403, {\n    error: 'trusted_local_host_execution_forbidden',\n    reasonCode: 'GUARDED_HOST_HTTP_FORBIDDEN',\n    message:\n      'Trusted local host execution is a local operator break-glass path and is never available through the HTTP sandbox API.',\n  })\n  return true\n}\n\nconst missionId = requestedMissionId(record)\nlet missionWorkspaceRoot: string | undefined\nif (missionId !== undefined) {\n  if (context.missionService === undefined) {\n    throw new SandboxRequestValidationError(\n      'missionId cannot be resolved because no mission service is configured',\n    )\n  }\n  const mission = context.missionService.get(missionId)\n  const visibility = resolveMissionVisibility(context.callerGrantId, context.teamSource)\n  const access = canAccessMission(mission, visibility, 'execute')\n  if (!access.allowed) {\n    if (access.relationship === 'none') {\n      sendJson(res, 404, { error: `Mission not found: ${missionId}` })\n    } else {\n      sendJson(res, 403, {\n        error: 'authorization_denied',\n        reasonCode: 'MISSION_NOT_AUTHORIZED_FOR_OPERATION',\n        message: `This grant may not run a sandbox execution against mission ${missionId}.`,\n      })\n    }\n    return true\n  }\n  missionWorkspaceRoot = mission.repository.rootPath\n}\n\nconst securedRecord = bindRepositoryToMissionWorkspace(record, missionWorkspaceRoot)\nconst request = context.service.validateRequest(securedRecord)\nconst result = await context.service.execute(request, {\n  mode: context.runtimeMode ?? 'APPROVED_EXECUTION',\n  ...(context.callerGrantId === undefined\n    ? {}\n    : {\n        ownership: {\n          ownerGrantId: context.callerGrantId,\n          ...(context.callerPrincipalId === undefined\n            ? {}\n            : { ownerPrincipalId: context.callerPrincipalId }),\n        },\n      }),\n})\nrecordMissionEvidence(context, request, result)\nsendJson(res, 200, { result })\n"
  },
  {
    "type": "after",
    "file": "src/runtime/tools/sandbox-tools.ts",
    "anchor": "const FORBIDDEN_SANDBOX_TOOL_FIELDS = new Set([\n  'command',\n  'shellCommand',\n  'executable',\n  'executablePath',\n  'rawImage',\n  'dockerArgs',\n  'podmanArgs',\n  'containerArgs',\n])\n",
    "text": "const GUARDED_HOST_RUNNER_PREFIX = 'guarded-host-'\n"
  }
]

await applyOperations(operations)
