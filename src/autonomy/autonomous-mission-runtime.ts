import path from 'node:path'

import type { MissionService } from '../mission/mission-service.js'
import { AutonomousMissionControl } from './autonomous-mission-control.js'
import { AutonomousMissionCoordinator } from './autonomous-mission-coordinator.js'
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
  const semanticIndexStore = new RepositorySemanticIndexStore(
    path.join(workspaceRoot, '.codemind'),
  )
  const loadSemanticIndex = async (repositoryRoot: string) => {
    const index = await semanticIndexStore.load(repositoryRoot)
    if (index === undefined) {
      throw new Error(`Repository semantic index was not found: ${repositoryRoot}`)
    }
    return index
  }
  const coordinator = new AutonomousMissionCoordinator({
    missionService: options.missionService,
    executor,
    executionStore,
    loadSemanticIndex,
    validationCommands: options.validationCommands,
    now: options.now,
  })
  const control = new AutonomousMissionControl({
    executionStore,
    missionService: options.missionService,
    now: options.now,
  })
  return { coordinator, control, executionStore, executor }
}
