import path from 'node:path'

import type { MissionService } from '../mission/mission-service.js'
import { AutonomousMissionControl } from './autonomous-mission-control.js'
import { AutonomousMissionCoordinator } from './autonomous-mission-coordinator.js'
import { MultiAgentExecutionTracker } from './multi-agent-execution-tracker.js'
import { MultiAgentMissionStore } from './multi-agent-mission-runtime.js'
import {
  JsonMissionExecutionStore,
  PersistentMissionExecutor,
  type MissionTaskExecutor,
} from './persistent-mission-executor.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'

export interface AutonomousMissionRuntimeOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly taskExecutor: MissionTaskExecutor
  readonly validationCommands: readonly string[]
  readonly now?: () => Date
}

export interface AutonomousMissionRuntime {
  readonly coordinator: AutonomousMissionCoordinator
  readonly control: AutonomousMissionControl
  readonly executionStore: JsonMissionExecutionStore
  readonly executor: PersistentMissionExecutor
  readonly multiAgentStore: MultiAgentMissionStore
  readonly multiAgentTracker: MultiAgentExecutionTracker
}

export function createAutonomousMissionRuntime(
  options: AutonomousMissionRuntimeOptions,
): AutonomousMissionRuntime {
  const workspaceRoot = path.resolve(options.workspaceRoot)
  const executionStore = new JsonMissionExecutionStore(workspaceRoot)
  const executor = new PersistentMissionExecutor({
    store: executionStore,
    executor: options.taskExecutor,
  })
  const multiAgentStore = new MultiAgentMissionStore(workspaceRoot)
  const multiAgentTracker = new MultiAgentExecutionTracker(multiAgentStore)
  const semanticIndexStore = new RepositorySemanticIndexStore(path.join(workspaceRoot, '.codemind'))
  const loadSemanticIndex = async (repositoryRoot: string) => {
    const index = await semanticIndexStore.load(repositoryRoot)
    if (index === undefined) {
      throw new Error(`Repository semantic index was not found: ${repositoryRoot}`)
    }
    return index
  }
  const clockOptions = options.now === undefined ? {} : { now: options.now }
  const coordinator = new AutonomousMissionCoordinator({
    missionService: options.missionService,
    executor,
    executionStore,
    loadSemanticIndex,
    validationCommands: options.validationCommands,
    multiAgentTracker,
    ...clockOptions,
  })
  const control = new AutonomousMissionControl({
    executionStore,
    missionService: options.missionService,
    ...clockOptions,
  })
  return {
    coordinator,
    control,
    executionStore,
    executor,
    multiAgentStore,
    multiAgentTracker,
  }
}
