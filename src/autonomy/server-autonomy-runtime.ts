import type { MissionService } from '../mission/mission-service.js'
import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import {
  createAutonomousMissionRuntime,
  type AutonomousMissionRuntime,
} from './autonomous-mission-runtime.js'
import { RuntimeAutonomousValidationRunner } from './runtime-validation-runner.js'
import {
  RuntimeMissionTaskExecutor,
  type AutonomousEditTaskExecutor,
} from './runtime-mission-task-executor.js'

export const DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS = [
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run build',
] as const

export interface ServerAutonomyRuntimeOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly hasGitHubToken: boolean
  readonly sandboxRunner?: SandboxRunner
  readonly editExecutor?: AutonomousEditTaskExecutor
  readonly validationCommands?: readonly string[]
}

/**
 * Assembles the live server autonomy runtime using the same policy-aware
 * validation path used elsewhere in CodeMind. Repository writes remain blocked
 * until a real edit executor is explicitly attached.
 */
export function createServerAutonomyRuntime(
  options: ServerAutonomyRuntimeOptions,
): AutonomousMissionRuntime {
  const policy = createRuntimePolicyForMode('APPROVED_EXECUTION', {
    hasGitHubToken: options.hasGitHubToken,
  })
  const validationRunner = new RuntimeAutonomousValidationRunner({
    policy,
    reason: 'Autonomous mission validation',
    ...(options.sandboxRunner === undefined ? {} : { sandboxRunner: options.sandboxRunner }),
  })
  const taskExecutor = new RuntimeMissionTaskExecutor({
    repositoryRoot: options.workspaceRoot,
    validationRunner,
    ...(options.editExecutor === undefined ? {} : { editExecutor: options.editExecutor }),
  })

  return createAutonomousMissionRuntime({
    workspaceRoot: options.workspaceRoot,
    missionService: options.missionService,
    taskExecutor,
    validationCommands: options.validationCommands ?? DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS,
  })
}
