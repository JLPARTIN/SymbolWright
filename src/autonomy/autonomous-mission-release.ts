import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MissionService } from '../mission/mission-service.js'
import type { AutonomousMissionStartResult } from './autonomous-mission-coordinator.js'
import type { MissionDashboardProjection } from './mission-dashboard-projection.js'
import type { MissionAcceptancePacket } from './mission-acceptance-packet.js'
import { MissionAcceptanceService } from './mission-acceptance-service.js'
import type { MultiAgentDashboardProjection } from './multi-agent-dashboard-projection.js'
import type {
  MissionExecutionStore,
  PersistedMissionExecution,
} from './persistent-mission-executor.js'

export type AutonomousMissionReleaseState =
  'merge-ready' | 'review-required' | 'blocked' | 'failed' | 'incomplete'

export type AutonomousMissionReleaseExecutionMode = 'start' | 'resume' | 'existing'

export interface AutonomousMissionReleaseRecord {
  readonly schemaVersion: 1
  readonly missionId: string
  readonly objective: string
  readonly state: AutonomousMissionReleaseState
  readonly nextAction: 'merge' | 'review' | 'resolve-blocker' | 'inspect-diagnostics' | 'resume'
  readonly executionMode: AutonomousMissionReleaseExecutionMode
  readonly generatedAt: string
  readonly recovery: {
    readonly resumed: boolean
    readonly interruptedTaskIds: readonly string[]
  }
  readonly dashboard: MissionDashboardProjection
  readonly specialists?: MultiAgentDashboardProjection | undefined
  readonly acceptance: MissionAcceptancePacket
  readonly acceptancePacketPath: string
}

export interface AutonomousMissionReleaseStore {
  load(missionId: string): Promise<AutonomousMissionReleaseRecord | undefined>
  save(record: AutonomousMissionReleaseRecord): Promise<void>
}

export class JsonAutonomousMissionReleaseStore implements AutonomousMissionReleaseStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.symbolwright', 'autonomy', 'releases')
  }

  async load(missionId: string): Promise<AutonomousMissionReleaseRecord | undefined> {
    try {
      const raw = await readFile(path.join(this.#root, `${validateId(missionId)}.json`), 'utf8')
      return JSON.parse(raw) as AutonomousMissionReleaseRecord
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async save(record: AutonomousMissionReleaseRecord): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(record.missionId)}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }
}

export interface AutonomousMissionReleaseCoordinator {
  start(missionId: string): Promise<AutonomousMissionStartResult>
  resume(missionId: string): Promise<AutonomousMissionStartResult>
  status(missionId: string): Promise<MissionDashboardProjection>
  specialists(missionId: string): Promise<MultiAgentDashboardProjection | undefined>
}

export interface AutonomousMissionReleaseServiceOptions {
  readonly workspaceRoot: string
  readonly missionService: Pick<MissionService, 'get' | 'appendEvent'>
  readonly coordinator: AutonomousMissionReleaseCoordinator
  readonly executionStore: MissionExecutionStore
  readonly validationCommands?: readonly string[]
  readonly store?: AutonomousMissionReleaseStore
  readonly generateAcceptance?: (
    missionId: string,
    repositoryRoot: string,
  ) => Promise<{ readonly packet: MissionAcceptancePacket; readonly path: string }>
  readonly now?: () => Date
}

export class AutonomousMissionReleaseService {
  readonly #missionService: AutonomousMissionReleaseServiceOptions['missionService']
  readonly #coordinator: AutonomousMissionReleaseCoordinator
  readonly #executionStore: MissionExecutionStore
  readonly #store: AutonomousMissionReleaseStore
  readonly #generateAcceptance: NonNullable<
    AutonomousMissionReleaseServiceOptions['generateAcceptance']
  >
  readonly #now: () => Date

  constructor(options: AutonomousMissionReleaseServiceOptions) {
    const workspaceRoot = path.resolve(options.workspaceRoot)
    this.#missionService = options.missionService
    this.#coordinator = options.coordinator
    this.#executionStore = options.executionStore
    this.#store = options.store ?? new JsonAutonomousMissionReleaseStore(workspaceRoot)
    this.#now = options.now ?? (() => new Date())
    this.#generateAcceptance =
      options.generateAcceptance ??
      (async (missionId, repositoryRoot) =>
        new MissionAcceptanceService({
          workspaceRoot,
          repositoryRoot,
          ...(options.validationCommands === undefined
            ? {}
            : { validationCommands: options.validationCommands }),
          now: this.#now,
        }).generate(missionId))
  }

  async execute(missionId: string): Promise<AutonomousMissionReleaseRecord> {
    const mission = this.#missionService.get(missionId)
    const previous = await this.#executionStore.load(missionId)
    const interruptedTaskIds = activeTaskIds(previous)
    const executionMode = releaseExecutionMode(previous)
    const dashboard = await this.#executeOrProject(missionId, previous)
    const [acceptanceResult, specialists] = await Promise.all([
      this.#generateAcceptance(missionId, mission.repository.rootPath),
      this.#coordinator.specialists(missionId),
    ])
    const state = releaseState(acceptanceResult.packet)
    const record: AutonomousMissionReleaseRecord = {
      schemaVersion: 1,
      missionId,
      objective: mission.objective,
      state,
      nextAction: nextAction(state),
      executionMode,
      generatedAt: this.#now().toISOString(),
      recovery: {
        resumed: executionMode === 'resume',
        interruptedTaskIds,
      },
      dashboard,
      ...(specialists === undefined ? {} : { specialists }),
      acceptance: acceptanceResult.packet,
      acceptancePacketPath: acceptanceResult.path,
    }
    await this.#store.save(record)
    this.#missionService.appendEvent(
      missionId,
      'autonomy.release.generated',
      `Autonomous engineering release generated: ${state}.`,
      {
        state,
        nextAction: record.nextAction,
        executionMode,
        resumed: record.recovery.resumed,
        interruptedTaskIds,
        acceptanceStatus: record.acceptance.status,
        mergeReadiness: record.acceptance.intelligence?.mergeReadiness.decision ?? 'unavailable',
        modifiedFiles: record.acceptance.modifiedFiles,
        evidenceCount: record.acceptance.evidence.length,
      },
    )
    return record
  }

  async load(missionId: string): Promise<AutonomousMissionReleaseRecord | undefined> {
    this.#missionService.get(missionId)
    return this.#store.load(missionId)
  }

  async #executeOrProject(
    missionId: string,
    previous: PersistedMissionExecution | undefined,
  ): Promise<MissionDashboardProjection> {
    if (previous === undefined) return (await this.#coordinator.start(missionId)).dashboard
    if (previous.completedAt !== undefined) return this.#coordinator.status(missionId)
    return (await this.#coordinator.resume(missionId)).dashboard
  }
}

function releaseExecutionMode(
  execution: PersistedMissionExecution | undefined,
): AutonomousMissionReleaseExecutionMode {
  if (execution === undefined) return 'start'
  return execution.completedAt === undefined ? 'resume' : 'existing'
}

function activeTaskIds(execution: PersistedMissionExecution | undefined): readonly string[] {
  if (execution === undefined) return []
  return execution.graph.tasks
    .filter((task) => ['running', 'validating', 'repairing', 'interrupted'].includes(task.state))
    .map((task) => task.id)
    .sort()
}

function releaseState(packet: MissionAcceptancePacket): AutonomousMissionReleaseState {
  if (packet.status === 'failed') return 'failed'
  if (packet.status === 'blocked') return 'blocked'
  if (packet.status === 'incomplete') return 'incomplete'
  if (!packet.validation.passed) return 'blocked'
  const decision = packet.intelligence?.mergeReadiness.decision
  if (decision === undefined) return 'review-required'
  if (decision === 'blocked') return 'blocked'
  return decision === 'ready' ? 'merge-ready' : 'review-required'
}

function nextAction(
  state: AutonomousMissionReleaseState,
): AutonomousMissionReleaseRecord['nextAction'] {
  switch (state) {
    case 'merge-ready':
      return 'merge'
    case 'review-required':
      return 'review'
    case 'blocked':
      return 'resolve-blocker'
    case 'failed':
      return 'inspect-diagnostics'
    case 'incomplete':
      return 'resume'
  }
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid mission ID: ${value}`)
  return value
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
