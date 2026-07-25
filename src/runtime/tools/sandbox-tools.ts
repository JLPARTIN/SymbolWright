import { SandboxHistoryStore } from '../../sandbox/sandbox-history.js'
import { SandboxService } from '../../sandbox/sandbox-service.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
} from '../../sandbox/sandbox-types.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

const FORBIDDEN_SANDBOX_TOOL_FIELDS = new Set([
  'command',
  'shellCommand',
  'executable',
  'executablePath',
  'rawImage',
  'dockerArgs',
  'podmanArgs',
  'containerArgs',
])

function assertNoForbiddenFields(input: unknown): void {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (FORBIDDEN_SANDBOX_TOOL_FIELDS.has(key)) {
      throw new Error(`sandbox_execute rejects raw command/container field: ${key}`)
    }
  }
}

function resolveSandboxService(context: RuntimeToolContext): SandboxService {
  return (
    context.sandboxService ??
    new SandboxService({
      historyStore: new SandboxHistoryStore({ workspaceRoot: context.cwd }),
    })
  )
}

function asToolRequest(input: unknown, context: RuntimeToolContext): unknown {
  assertNoForbiddenFields(input)
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('sandbox_execute input must be a structured object request.')
  }
  const record = input as Record<string, unknown>
  return {
    ...record,
    ...(record['missionId'] === undefined && context.sessionId !== undefined
      ? { missionId: context.sessionId }
      : {}),
  }
}

function renderExecutionResult(result: SandboxExecutionResult): string {
  return JSON.stringify(
    {
      executionId: result.executionId,
      languageId: result.languageId,
      runnerId: result.runnerId,
      backend: result.backend,
      trustClass: result.trustClass,
      status: result.status,
      verificationLevel: result.evidence.verificationLevel,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      outputTruncated: result.outputTruncated,
      stdout: result.stdout,
      stderr: result.stderr,
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      cleanup: result.cleanup,
      evidence: {
        inputHash: result.evidence.inputHash,
        outputHash: result.evidence.outputHash,
        policyDecision: result.evidence.policyDecision,
        policyReason: result.evidence.policyReason,
      },
    },
    null,
    2,
  )
}

function proposalFor(request: SandboxExecutionRequest): string {
  return JSON.stringify(
    {
      status: 'policy-blocked',
      policyDecision: 'blocked',
      reason:
        'PROPOSAL_ONLY mode returns a structured sandbox execution proposal without launching a process.',
      request: {
        languageId: request.languageId,
        mode: request.mode,
        requestedRunnerId: request.requestedRunnerId,
        sourceKind:
          request.source !== undefined
            ? 'snippet'
            : request.files !== undefined
              ? 'file-bundle'
              : 'repository',
        fileCount: request.files?.length ?? 0,
        repositorySelectedPaths: request.repository?.selectedPaths ?? [],
      },
    },
    null,
    2,
  )
}

export const sandboxListRuntimesTool: RuntimeToolDefinition = {
  name: 'sandbox_list_runtimes',
  description:
    'List SymbolWright sandbox runtime inventory, runner availability, trust classes, and backend readiness.',
  capability: 'READ',
  execute: async (_input: unknown, context: RuntimeToolContext): Promise<string> => {
    const service = resolveSandboxService(context)
    const inventory = await service.refreshInventory()
    return JSON.stringify(
      {
        schemaVersion: inventory.schemaVersion,
        generatedAt: inventory.generatedAt,
        runners: inventory.runners.map((runner) => ({
          id: runner.id,
          languages: runner.languageIds,
          backend: runner.backend,
          trustClass: runner.trustClass,
          availability: runner.availability.status,
          version: runner.availability.version,
          reason: runner.availability.reason,
          networkPolicy: runner.networkPolicy,
          dependencyState: runner.dependencyState,
          capabilities: runner.capabilities,
        })),
        warnings: inventory.warnings,
      },
      null,
      2,
    )
  },
}

export const sandboxExecuteTool: RuntimeToolDefinition = {
  name: 'sandbox_execute',
  description:
    'Execute, compile, or test code through SymbolWright structured sandbox execution. Accepts only structured sandbox requests; raw shell commands, executable paths, image names, and container args are rejected.',
  capability: 'APPROVED_COMMAND',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const service = resolveSandboxService(context)
    const rawRequest = asToolRequest(input, context)
    await service.refreshInventory()
    const request = service.validateRequest(rawRequest)

    if (context.policy.mode === 'PLAN_ONLY' || context.policy.mode === 'READ_ONLY') {
      const result = await service.execute(request, { mode: context.policy.mode })
      context.recordSandboxExecution?.(request, result)
      return renderExecutionResult(result)
    }

    if (context.policy.mode === 'PROPOSAL_ONLY') {
      return proposalFor(request)
    }

    const result = await service.execute(request, { mode: 'APPROVED_EXECUTION' })
    context.recordSandboxExecution?.(request, result)
    return renderExecutionResult(result)
  },
}
