import { randomUUID } from 'node:crypto'

import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import { DEFAULT_SANDBOX_DISCOVERY_PROBES, discoverRuntimeCommands } from './sandbox-discovery.js'
import {
  executeGuardedHostRequest,
  type GuardedHostExecutionController,
} from './sandbox-guarded-host-backend.js'
import type {
  SandboxExecutionRecord,
  SandboxHistoryList,
  SandboxHistoryStore,
} from './sandbox-history.js'
import { normalizeSandboxLimits } from './sandbox-limits.js'
import { evaluateSandboxPolicy } from './sandbox-policy.js'
import { validateSandboxExecutionRequest } from './sandbox-request.js'
import {
  buildSandboxInventory,
  findSandboxRunner,
  listSandboxLanguageIds,
  listSandboxRunnerIds,
} from './sandbox-registry.js'
import { excerptSandboxOutput, sha256Text } from './sandbox-redaction.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxImageDefinition,
  SandboxInventory,
  SandboxRunnerAvailability,
  SandboxRunnerDefinition,
  VerificationLevel,
} from './sandbox-types.js'

export type SandboxInventoryBuilder = (
  commandAvailability?: ReadonlyMap<string, SandboxRunnerAvailability>,
) => SandboxInventory

export interface SandboxServiceOptions {
  readonly inventory?: SandboxInventory
  readonly buildInventory?: SandboxInventoryBuilder
  readonly discoverCommandAvailability?: () => Promise<
    ReadonlyMap<string, SandboxRunnerAvailability>
  >
  readonly historyStore?: SandboxHistoryStore
  readonly now?: () => Date
  readonly generateExecutionId?: () => string
  readonly env?: NodeJS.ProcessEnv
}

export interface SandboxExecutionContext {
  readonly mode: SymbolWrightRuntimeMode
}

export interface SandboxCancelResult {
  readonly ok: boolean
  readonly executionId: string
  readonly status: 'cancelled' | 'not_running'
  readonly result?: SandboxExecutionResult
  readonly reason?: string
}

export class SandboxService {
  private inventory: SandboxInventory
  private readonly buildInventory: SandboxInventoryBuilder
  private readonly discoverCommandAvailability: () => Promise<
    ReadonlyMap<string, SandboxRunnerAvailability>
  >
  private readonly historyStore: SandboxHistoryStore | undefined
  private readonly now: () => Date
  private readonly generateExecutionId: () => string
  private readonly env: NodeJS.ProcessEnv
  private readonly activeExecutions = new Map<string, GuardedHostExecutionController>()

  public constructor(options: SandboxServiceOptions) {
    this.env = options.env ?? process.env
    this.buildInventory =
      options.buildInventory ??
      ((commandAvailability) =>
        options.inventory ??
        buildSandboxInventory({
          env: this.env,
          ...(commandAvailability === undefined ? {} : { commandAvailability }),
        }))
    this.discoverCommandAvailability =
      options.discoverCommandAvailability ??
      (() => discoverRuntimeCommands(DEFAULT_SANDBOX_DISCOVERY_PROBES, { env: this.env }))
    this.inventory = options.inventory ?? this.buildInventory()
    this.historyStore = options.historyStore
    this.now = options.now ?? (() => new Date())
    this.generateExecutionId = options.generateExecutionId ?? (() => `sandbox_${randomUUID()}`)
  }

  public listInventory(): SandboxInventory {
    return this.inventory
  }

  public listImages(): readonly SandboxImageDefinition[] {
    return this.inventory.images
  }

  public async refreshInventory(): Promise<SandboxInventory> {
    const commandAvailability = await this.discoverCommandAvailability()
    this.inventory = this.buildInventory(commandAvailability)
    return this.inventory
  }

  public listExecutions(limit = 50): SandboxHistoryList {
    return this.historyStore?.list(limit) ?? { schemaVersion: 1, executions: [], warnings: [] }
  }

  public getExecution(executionId: string): SandboxExecutionRecord | undefined {
    return this.historyStore?.read(executionId)
  }

  public async cancelExecution(executionId: string): Promise<SandboxCancelResult> {
    const controller = this.activeExecutions.get(executionId)
    if (controller === undefined) {
      return {
        ok: false,
        executionId,
        status: 'not_running',
        reason: 'No active sandbox execution exists for that id.',
      }
    }
    controller.cancel()
    const result = await controller.completed
    this.activeExecutions.delete(executionId)
    return { ok: true, executionId, status: 'cancelled', result }
  }

  public validateRequest(raw: unknown): SandboxExecutionRequest {
    return validateSandboxExecutionRequest(raw, {
      knownLanguageIds: listSandboxLanguageIds(),
      knownRunnerIds: listSandboxRunnerIds(this.inventory),
    })
  }

  public async execute(
    raw: unknown,
    context: SandboxExecutionContext,
  ): Promise<SandboxExecutionResult> {
    const executionId = this.generateExecutionId()
    const startedAt = this.now().toISOString()
    const started = Date.parse(startedAt)
    const request = this.validateRequest(raw)
    const runner = findSandboxRunner(this.inventory, request.languageId, request.requestedRunnerId)

    if (runner === undefined) {
      return this.persistResult(
        request,
        this.result(executionId, request, unavailableRunner(request), startedAt, 'unavailable', {
          policyDecision: 'blocked',
          policyReason: `No available runner for language ${request.languageId}.`,
        }),
      )
    }

    const effectiveRunner: SandboxRunnerDefinition = {
      ...runner,
      limits: normalizeSandboxLimits(request.limits),
    }
    const decision = evaluateSandboxPolicy(request, effectiveRunner, {
      mode: context.mode,
      env: this.env,
    })
    if (!decision.allowed) {
      return this.persistResult(
        request,
        this.result(executionId, request, effectiveRunner, startedAt, 'policy-blocked', {
          policyDecision: 'blocked',
          policyReason: decision.reason,
        }),
      )
    }

    if (effectiveRunner.backend === 'guarded-host') {
      const result = await executeGuardedHostRequest({
        executionId,
        request,
        runner: effectiveRunner,
        startedAt,
        now: this.now,
        env: this.env,
        onStart: (controller) => this.activeExecutions.set(executionId, controller),
      })
      this.activeExecutions.delete(executionId)
      return this.persistResult(request, result)
    }

    if (effectiveRunner.backend === 'browser') {
      return this.persistResult(
        request,
        this.result(executionId, request, effectiveRunner, startedAt, 'policy-blocked', {
          policyDecision: 'blocked',
          policyReason:
            'No execution backend: Browser-isolated runners execute in the browser runtime, not through the server sandbox API.',
          durationStartedAt: started,
        }),
      )
    }

    return this.persistResult(
      request,
      this.result(executionId, request, effectiveRunner, startedAt, 'unavailable', {
        policyDecision: 'blocked',
        policyReason: `No executable backend is wired for ${effectiveRunner.backend}.`,
        durationStartedAt: started,
      }),
    )
  }

  private persistResult(
    request: SandboxExecutionRequest,
    result: SandboxExecutionResult,
  ): SandboxExecutionResult {
    const finalized = this.finalizeResult(request, result)
    this.historyStore?.record(finalized, request.missionId)
    return finalized
  }

  private finalizeResult(
    request: SandboxExecutionRequest,
    result: SandboxExecutionResult,
  ): SandboxExecutionResult {
    const outputExcerpt = excerptSandboxOutput(result.stdout, result.stderr)
    return {
      ...result,
      outputTruncated: result.outputTruncated || outputExcerpt.includes('[TRUNCATED]'),
      evidence: {
        ...result.evidence,
        inputHash: sha256Text(JSON.stringify(request)),
        ...(result.stdout.length === 0 && result.stderr.length === 0
          ? {}
          : { outputHash: sha256Text(`${result.stdout}\n${result.stderr}`) }),
        ...(outputExcerpt.length === 0 ? {} : { outputExcerpt }),
      },
    }
  }

  private result(
    executionId: string,
    request: SandboxExecutionRequest,
    runner: SandboxRunnerDefinition,
    startedAt: string,
    status: SandboxExecutionResult['status'],
    options: {
      readonly policyDecision: 'allowed' | 'blocked'
      readonly policyReason?: string
      readonly stdout?: string
      readonly stderr?: string
      readonly exitCode?: number
      readonly signal?: string
      readonly verificationLevel?: VerificationLevel
      readonly durationStartedAt?: number
    },
  ): SandboxExecutionResult {
    const completedAt = this.now().toISOString()
    const started = options.durationStartedAt ?? Date.parse(startedAt)
    const stdout = options.stdout ?? ''
    const stderr = options.stderr ?? ''
    const outputExcerpt = excerptSandboxOutput(stdout, stderr)
    return {
      executionId,
      languageId: request.languageId,
      runnerId: runner.id,
      trustClass: runner.trustClass,
      backend: runner.backend,
      status,
      startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - started),
      ...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      stdout,
      stderr,
      outputTruncated: outputExcerpt.includes('[TRUNCATED]'),
      diagnostics: [],
      artifacts: [],
      evidence: {
        verificationLevel: options.verificationLevel ?? 'UNVERIFIED',
        inputHash: sha256Text(JSON.stringify(request)),
        ...(stdout.length === 0 && stderr.length === 0
          ? {}
          : { outputHash: sha256Text(`${stdout}\n${stderr}`) }),
        ...(outputExcerpt.length === 0 ? {} : { outputExcerpt }),
        policyDecision: options.policyDecision,
        ...(options.policyReason === undefined ? {} : { policyReason: options.policyReason }),
      },
      cleanup: { attempted: false, succeeded: true },
    }
  }
}

function unavailableRunner(request: SandboxExecutionRequest): SandboxRunnerDefinition {
  return {
    id: request.requestedRunnerId ?? `unavailable-${request.languageId}`,
    languageIds: [request.languageId],
    displayName: `Unavailable ${request.languageId} runner`,
    trustClass: 'unavailable',
    backend: 'unavailable',
    availability: {
      status: 'unavailable',
      reason: 'No matching runtime was discovered.',
      checkedAt: new Date(0).toISOString(),
    },
    capabilities: {
      run: false,
      compile: false,
      test: false,
      stdin: false,
      multiFile: false,
      repository: false,
      network: false,
    },
    limits: normalizeSandboxLimits(request.limits),
    networkPolicy: 'disabled',
    dependencyState: 'unsupported',
    notes: ['Unavailable runners do not execute code.'],
  }
}
