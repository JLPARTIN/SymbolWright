import { randomUUID } from 'node:crypto'

import type { CodemindRuntimeMode } from '../runtime/types.js'
import { DEFAULT_SANDBOX_DISCOVERY_PROBES, discoverRuntimeCommands } from './sandbox-discovery.js'
import type {
  SandboxHistoryList,
  SandboxHistoryStore,
  SandboxExecutionRecord,
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
  readonly mode: CodemindRuntimeMode
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
    const startedAt = this.now().toISOString()
    const started = Date.parse(startedAt)
    const request = this.validateRequest(raw)
    const runner = findSandboxRunner(this.inventory, request.languageId, request.requestedRunnerId)

    if (runner === undefined) {
      return this.persistResult(
        request,
        this.result(request, unavailableRunner(request), startedAt, 'unavailable', {
          policyDecision: 'blocked',
          policyReason: `No available runner for language ${request.languageId}.`,
        }),
      )
    }

    const decision = evaluateSandboxPolicy(request, runner, {
      mode: context.mode,
      env: this.env,
    })
    if (!decision.allowed) {
      return this.persistResult(
        request,
        this.result(request, runner, startedAt, 'policy-blocked', {
          policyDecision: 'blocked',
          policyReason: decision.reason,
        }),
      )
    }

    return this.persistResult(
      request,
      this.result(request, runner, startedAt, 'policy-blocked', {
        policyDecision: 'blocked',
        policyReason:
          'Bundle 4 runtime foundation is policy-ready, but this runner has no execution backend wired yet.',
        durationStartedAt: started,
      }),
    )
  }

  private persistResult(
    request: SandboxExecutionRequest,
    result: SandboxExecutionResult,
  ): SandboxExecutionResult {
    this.historyStore?.record(result, request.missionId)
    return result
  }

  private result(
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
      executionId: this.generateExecutionId(),
      languageId: request.languageId,
      runnerId: runner.id,
      trustClass: runner.trustClass,
      backend: runner.backend,
      status,
      startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - started),
      ...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
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
