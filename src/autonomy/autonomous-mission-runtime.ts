import path from 'node:path'

import type { AccessRuntime } from '../access/access-runtime.js'
import type { GovernanceStore } from '../access/governance-store.js'
import type { MissionService } from '../mission/mission-service.js'
import { AutonomousMissionControl } from './autonomous-mission-control.js'
import { AutonomousMissionCoordinator } from './autonomous-mission-coordinator.js'
import {
  AutonomousMissionReleaseService,
  JsonAutonomousMissionReleaseStore,
} from './autonomous-mission-release.js'
import { registerAutonomousMissionReleaseService } from './autonomous-mission-release-registry.js'
import { JsonAutonomousRepairLoopStore } from './autonomous-repair-loop.js'
import { MissionExecutionAbortRegistry } from './mission-execution-abort-registry.js'
import { MissionExecutionLock } from './mission-execution-lock.js'
import { MultiAgentExecutionTracker } from './multi-agent-execution-tracker.js'
import { MultiAgentMissionStore } from './multi-agent-mission-runtime.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type MissionTaskExecutor,
} from './persistent-mission-executor.js'
import { ensureRepositorySemanticIndex } from './repository-semantic-index-bootstrap.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'

export interface AutonomousMissionRuntimeOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly taskExecutor: MissionTaskExecutor
  readonly validationCommands?: readonly string[]
  readonly resolveValidationCommands?: (
    missionId: string,
    repositoryRoot: string,
  ) => Promise<readonly string[]>
  /** Global fallback mission-duration cap (minutes), and the runtime used to source a per-grant
   * `executionLimits.maxMissionDurationMinutes` override — see
   * `AutonomousMissionCoordinatorOptions` for the resolution rule. */
  readonly maxDurationMinutes?: number
  readonly accessRuntime?: AccessRuntime
  readonly getGovernanceStore?: () => GovernanceStore
  readonly now?: () => Date
}

export interface AutonomousMissionRuntime {
  readonly coordinator: AutonomousMissionCoordinator
  readonly control: AutonomousMissionControl
  readonly release: AutonomousMissionReleaseService
  readonly releaseStore: JsonAutonomousMissionReleaseStore
  readonly executionStore: JsonMissionExecutionStore
  readonly executor: PersistentMissionExecutor
  readonly repairLoopStore: JsonAutonomousRepairLoopStore
  readonly multiAgentStore: MultiAgentMissionStore
  readonly multiAgentTracker: MultiAgentExecutionTracker
  /** Shared with `AutonomousMissionControl`/`AutonomousMissionCoordinator` so a `pause`/`cancel`
   * request can reach a running mission's in-flight execution -- see
   * `mission-execution-abort-registry.ts`. Exposed so `startChatServer`/`startUnifiedServer` can
   * abort every registered execution during graceful shutdown. */
  readonly abortRegistry: MissionExecutionAbortRegistry
}

export function createAutonomousMissionRuntime(
  options: AutonomousMissionRuntimeOptions,
): AutonomousMissionRuntime {
  const workspaceRoot = path.resolve(options.workspaceRoot)
  const executionStore = new JsonMissionExecutionStore(workspaceRoot)
  // Shared, not per-class, so `PersistentMissionExecutor`'s run loop and
  // `AutonomousMissionControl`'s pause/cancel/retry serialize their read-modify-write sequences
  // against each other, not just against themselves (mission-execution-lock.ts).
  const lock = new MissionExecutionLock()
  const abortRegistry = new MissionExecutionAbortRegistry()
  const executor = new PersistentMissionExecutor({
    store: executionStore,
    executor: options.taskExecutor,
    lock,
  })
  const repairLoopStore = new JsonAutonomousRepairLoopStore(workspaceRoot)
  const releaseStore = new JsonAutonomousMissionReleaseStore(workspaceRoot)
  const multiAgentStore = new MultiAgentMissionStore(workspaceRoot)
  const multiAgentTracker = new MultiAgentExecutionTracker(multiAgentStore)
  const semanticIndexStore = new RepositorySemanticIndexStore(
    path.join(workspaceRoot, '.symbolwright'),
  )
  const loadSemanticIndex = async (repositoryRoot: string) =>
    ensureRepositorySemanticIndex({
      workspaceRoot,
      repositoryRoot,
      store: semanticIndexStore,
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  const clockOptions = options.now === undefined ? {} : { now: options.now }
  const coordinator = new AutonomousMissionCoordinator({
    missionService: options.missionService,
    executor,
    executionStore,
    loadSemanticIndex,
    loadRepairLoop: (missionId) => repairLoopStore.load(`repair-${missionId}`),
    ...(options.validationCommands === undefined
      ? {}
      : { validationCommands: options.validationCommands }),
    ...(options.resolveValidationCommands === undefined
      ? {}
      : { resolveValidationCommands: options.resolveValidationCommands }),
    ...(options.maxDurationMinutes === undefined
      ? {}
      : { maxDurationMinutes: options.maxDurationMinutes }),
    ...(options.accessRuntime === undefined ? {} : { accessRuntime: options.accessRuntime }),
    ...(options.getGovernanceStore === undefined
      ? {}
      : { getGovernanceStore: options.getGovernanceStore }),
    multiAgentTracker,
    abortRegistry,
    ...clockOptions,
  })
  const control = new AutonomousMissionControl({
    executionStore,
    missionService: options.missionService,
    lock,
    abortRegistry,
    ...clockOptions,
  })
  const release = new AutonomousMissionReleaseService({
    workspaceRoot,
    missionService: options.missionService,
    coordinator,
    executionStore,
    store: releaseStore,
    ...clockOptions,
  })
  registerAutonomousMissionReleaseService(coordinator, release)
  return {
    coordinator,
    control,
    release,
    releaseStore,
    executionStore,
    executor,
    repairLoopStore,
    multiAgentStore,
    multiAgentTracker,
    abortRegistry,
  }
}
