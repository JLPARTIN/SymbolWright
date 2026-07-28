import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import {
  executeStrongSandboxContainer,
  reapStrongSandboxOrphans,
  type ExecuteStrongSandboxContainerInput,
  type SandboxBackendExecutionController,
  type StrongSandboxReaperReport,
} from './sandbox-container-backend.js'
import { DEFAULT_SANDBOX_DISCOVERY_PROBES, discoverRuntimeCommands } from './sandbox-discovery.js'
import { finalizeSandboxExecutionEvidence } from './sandbox-evidence.js'
import { SandboxExecutionBroker, type SandboxBrokerDecision } from './sandbox-execution-broker.js'
import {
  executeGuardedHostRequest,
  type GuardedHostExecutionController,
} from './sandbox-guarded-host-backend.js'
import type {
  SandboxExecutionOwnership,
  SandboxExecutionRecord,
  SandboxHistoryList,
  SandboxHistoryStore,
} from './sandbox-history.js'
import { findSandboxImage, type SandboxContainerEngineStatus } from './sandbox-images.js'
import { normalizeSandboxLimits } from './sandbox-limits.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
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

interface ActiveSandboxExecutionController {
  cancel(): void
  readonly completed: Promise<SandboxExecutionResult>
}

export interface SandboxServiceOptions {
  readonly inventory?: SandboxInventory
  readonly buildInventory?: SandboxInventoryBuilder
  readonly discoverCommandAvailability?: () => Promise<
    ReadonlyMap<string, SandboxRunnerAvailability>
  >
  readonly historyStore?: SandboxHistoryStore
  readonly broker?: SandboxExecutionBroker
  readonly executeContainer?: (
    input: ExecuteStrongSandboxContainerInput,
  ) => Promise<SandboxExecutionResult>
  readonly reapContainers?: (
    engine: SandboxContainerEngineStatus,
    env?: NodeJS.ProcessEnv,
  ) => Promise<StrongSandboxReaperReport>
  readonly workspaceRoot?: string
  readonly containerStateRoot?: string
  readonly now?: () => Date
  readonly generateExecutionId?: () => string
  readonly env?: NodeJS.ProcessEnv
}

export interface SandboxExecutionContext {
  readonly mode: SymbolWrightRuntimeMode
  /**
   * Server-derived authority. HTTP and delegated callers must provide this explicitly. Direct
   * internal calls without it retain the legacy local-operator behavior and are resolved as an
   * offline, local operator execution.
   */
  readonly authorization?: SandboxAuthorizationContext
  /** Who is running this execution -- recorded on the history entry for list/get/cancel guards. */
  readonly ownership?: SandboxExecutionOwnership
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
  private readonly broker: SandboxExecutionBroker
  private readonly executeContainer: (
    input: ExecuteStrongSandboxContainerInput,
  ) => Promise<SandboxExecutionResult>
  private readonly reapContainers: (
    engine: SandboxContainerEngineStatus,
    env?: NodeJS.ProcessEnv,
  ) => Promise<StrongSandboxReaperReport>
  private readonly containerStateRoot: string
  private readonly now: () => Date
  private readonly generateExecutionId: () => string
  private readonly env: NodeJS.ProcessEnv
  private readonly activeExecutions = new Map<string, ActiveSandboxExecutionController>()

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
    this.broker = options.broker ?? new SandboxExecutionBroker({ env: this.env, now: this.now })
    this.executeContainer = options.executeContainer ?? executeStrongSandboxContainer
    this.reapContainers = options.reapContainers ?? reapStrongSandboxOrphans
    this.generateExecutionId = options.generateExecutionId ?? (() => `sandbox_${randomUUID()}`)
    this.containerStateRoot = path.resolve(
      options.containerStateRoot ??
        this.env['SYMBOLWRIGHT_SANDBOX_STATE_ROOT'] ??
        path.join(
          os.tmpdir(),
          'symbolwright-strong-sandbox',
          workspaceScopeHash(options.workspaceRoot ?? process.cwd()),
        ),
    )
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

  public async reconcileContainerOrphans(): Promise<StrongSandboxReaperReport> {
    await this.refreshInventory()
    const runner = this.inventory.runners.find(
      (candidate) => candidate.backend === 'container' && candidate.container !== undefined,
    )
    if (runner?.container === undefined) {
      return {
        attempted: false,
        engine: 'none',
        removedContainerIds: [],
        warnings: ['No strong container runner is registered.'],
      }
    }
    return this.reapContainers(containerEngineStatus(runner), this.env)
  }

  public async shutdown(): Promise<void> {
    const controllers = [...this.activeExecutions.values()]
    for (const controller of controllers) controller.cancel()
    await Promise.allSettled(controllers.map((controller) => controller.completed))
    this.activeExecutions.clear()
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
    const authorization =
      context.authorization ?? this.localOperatorAuthorization(request, context.mode)
    const decision = this.broker.authorize(request, runner, authorization)
    const selectedRunner = decision.effectiveRunner ?? runner ?? unavailableRunner(request)

    if (!decision.allowed) {
      return this.persistResult(
        request,
        this.result(
          executionId,
          request,
          selectedRunner,
          startedAt,
          decision.reasonCode === 'SANDBOX_RUNNER_NOT_FOUND' ? 'unavailable' : 'policy-blocked',
          {
            policyDecision: 'blocked',
            policyReason: decision.reason,
          },
        ),
        context.ownership,
        decision,
        authorization,
      )
    }

    if (selectedRunner.backend === 'container') {
      const imageId = selectedRunner.container?.imageId
      const image =
        imageId === undefined ? undefined : findSandboxImage(this.inventory.images, imageId)
      if (selectedRunner.container === undefined || image === undefined) {
        const unavailableDecision = blockAuthorizedExecution(
          decision,
          'SANDBOX_CONTAINER_CONFIGURATION_MISSING',
          'The selected container runner has no matching immutable image configuration.',
        )
        return this.persistResult(
          request,
          this.result(executionId, request, selectedRunner, startedAt, 'unavailable', {
            policyDecision: 'blocked',
            policyReason: unavailableDecision.reason,
            durationStartedAt: started,
          }),
          context.ownership,
          unavailableDecision,
          authorization,
        )
      }
      const result = await this.executeContainer({
        executionId,
        request,
        runner: selectedRunner,
        image,
        engine: containerEngineStatus(selectedRunner),
        startedAt,
        now: this.now,
        env: this.env,
        stateRoot: this.containerStateRoot,
        onStart: (controller: SandboxBackendExecutionController) =>
          this.activeExecutions.set(executionId, controller),
      })
      this.activeExecutions.delete(executionId)
      return this.persistResult(request, result, context.ownership, decision, authorization)
    }

    if (selectedRunner.backend === 'guarded-host') {
      const result = await executeGuardedHostRequest({
        executionId,
        request,
        runner: selectedRunner,
        startedAt,
        now: this.now,
        env: this.env,
        onStart: (controller: GuardedHostExecutionController) =>
          this.activeExecutions.set(executionId, controller),
      })
      this.activeExecutions.delete(executionId)
      return this.persistResult(request, result, context.ownership, decision, authorization)
    }

    if (selectedRunner.backend === 'browser') {
      const blockedDecision = blockAuthorizedExecution(
        decision,
        'SANDBOX_BACKEND_NOT_SERVER_EXECUTABLE',
        'No execution backend: Browser-isolated runners execute in the browser runtime, not through the server sandbox API.',
      )
      return this.persistResult(
        request,
        this.result(executionId, request, selectedRunner, startedAt, 'policy-blocked', {
          policyDecision: 'blocked',
          policyReason: blockedDecision.reason,
          durationStartedAt: started,
        }),
        context.ownership,
        blockedDecision,
        authorization,
      )
    }

    const unavailableDecision = blockAuthorizedExecution(
      decision,
      'SANDBOX_BACKEND_NOT_WIRED',
      `No executable backend is wired for ${selectedRunner.backend}.`,
    )
    return this.persistResult(
      request,
      this.result(executionId, request, selectedRunner, startedAt, 'unavailable', {
        policyDecision: 'blocked',
        policyReason: unavailableDecision.reason,
        durationStartedAt: started,
      }),
      context.ownership,
      unavailableDecision,
      authorization,
    )
  }

  private persistResult(
    request: SandboxExecutionRequest,
    result: SandboxExecutionResult,
    ownership: SandboxExecutionOwnership | undefined,
    decision: SandboxBrokerDecision,
    authorization: SandboxAuthorizationContext,
  ): SandboxExecutionResult {
    const finalized = finalizeSandboxExecutionEvidence({
      request,
      result,
      decision,
      authorization,
    })
    this.historyStore?.record(finalized, request.missionId, ownership)
    return finalized
  }

  private localOperatorAuthorization(
    request: SandboxExecutionRequest,
    mode: SymbolWrightRuntimeMode,
  ): SandboxAuthorizationContext {
    const deploymentMode =
      this.env['SYMBOLWRIGHT_DEPLOYMENT_MODE']?.trim().toLowerCase() === 'hosted'
        ? 'hosted'
        : 'local'
    return {
      deploymentMode,
      callerKind: 'operator',
      runtimeMode: mode,
      approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
      repositoryId: request.repository?.rootPath ?? 'inline-source',
      workspaceId: request.missionId ?? request.repository?.rootPath ?? 'inline-source',
      ...(request.missionId === undefined ? {} : { missionId: request.missionId }),
      intent: 'offline-execution',
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

function blockAuthorizedExecution(
  decision: SandboxBrokerDecision,
  reasonCode: string,
  reason: string,
): SandboxBrokerDecision {
  return {
    ...decision,
    allowed: false,
    reasonCode,
    reason,
  }
}

function containerEngineStatus(runner: SandboxRunnerDefinition): SandboxContainerEngineStatus {
  const engine = runner.container?.engine
  if (engine === undefined) {
    return {
      engine: 'none',
      status: 'unavailable',
      reason: 'Runner has no configured container engine.',
    }
  }
  return {
    engine,
    status: runner.availability.status,
    ...(runner.availability.version === undefined ? {} : { version: runner.availability.version }),
    reason:
      runner.availability.reason ??
      `${engine} availability was inherited from strong sandbox runtime discovery.`,
  }
}

function workspaceScopeHash(workspaceRoot: string): string {
  return createHash('sha256').update(path.resolve(workspaceRoot)).digest('hex').slice(0, 24)
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
