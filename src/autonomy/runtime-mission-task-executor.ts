import type {
  MissionTaskExecutionResult,
  MissionTaskExecutor,
  MissionTaskRepairInput,
} from './persistent-mission-executor.js'
import type { PersistentMissionRepairController } from './persistent-mission-repair-controller.js'
import type { AutonomousTaskNode } from './task-graph.types.js'
import type { AutonomousValidationRunner } from './autonomous-repair-loop.js'

export interface AutonomousEditExecutionContext {
  readonly ownedBaselineFiles?: readonly string[]
}

export interface AutonomousEditTaskExecutor {
  execute(
    task: AutonomousTaskNode,
    context?: AutonomousEditExecutionContext,
    signal?: AbortSignal,
  ): Promise<MissionTaskExecutionResult>
}

export interface RuntimeMissionTaskExecutorOptions {
  readonly repositoryRoot: string
  readonly validationRunner: AutonomousValidationRunner
  readonly editExecutor?: AutonomousEditTaskExecutor
  readonly repairController?: PersistentMissionRepairController
}

/**
 * Production mission-task adapter.
 *
 * Analysis tasks produce durable evidence, validation tasks use SymbolWright's
 * policy-aware validation runner, and edit tasks require an explicitly wired
 * editing strategy. An absent editing strategy is reported as blocked rather
 * than pretending repository changes were applied.
 */
export class RuntimeMissionTaskExecutor implements MissionTaskExecutor {
  readonly #repositoryRoot: string
  readonly #validationRunner: AutonomousValidationRunner
  readonly #editExecutor: AutonomousEditTaskExecutor | undefined
  readonly #repairController: PersistentMissionRepairController | undefined

  constructor(options: RuntimeMissionTaskExecutorOptions) {
    this.#repositoryRoot = options.repositoryRoot
    this.#validationRunner = options.validationRunner
    this.#editExecutor = options.editExecutor
    this.#repairController = options.repairController
  }

  async execute(
    task: AutonomousTaskNode,
    signal?: AbortSignal,
  ): Promise<MissionTaskExecutionResult> {
    if (task.kind === 'validation') {
      return this.#executeValidation(task)
    }

    if (task.kind === 'edit-session' || task.kind === 'repair') {
      if (this.#editExecutor === undefined) {
        return {
          state: 'blocked',
          diagnostics: [
            `No autonomous edit strategy is configured for task ${task.id}.`,
            'Attach an AutonomousEditTaskExecutor before starting write-capable missions.',
          ],
          evidence: [{ kind: 'diagnostic', id: `blocked-${task.id}` }],
        }
      }
      return this.#editExecutor.execute(task, undefined, signal)
    }

    return {
      state: 'completed',
      evidence: [{ kind: 'tool-call', id: `analysis-${task.id}` }],
      artifacts: [...task.resources.reads, task.objective],
    }
  }

  async repair(input: MissionTaskRepairInput): Promise<MissionTaskExecutionResult> {
    if (this.#repairController === undefined) {
      return {
        state: 'failed',
        diagnostics: ['Persistent autonomous repair is not configured for this mission.'],
        evidence: [{ kind: 'diagnostic', id: `repair-unavailable-${input.validationTask.id}` }],
      }
    }
    return this.#repairController.repair(input)
  }

  async #executeValidation(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult> {
    const command = validationCommand(task)
    const result = await this.#validationRunner.run({
      repositoryRoot: this.#repositoryRoot,
      phase: task.id,
      command,
    })
    await this.#repairController?.recordValidation(task, result)

    return {
      state: result.passed ? 'completed' : 'failed',
      diagnostics: result.passed
        ? []
        : [result.stderr || result.stdout || `${command} exited with code ${result.exitCode}`],
      artifacts: [command, `${result.durationMs}ms`],
      evidence: [{ kind: 'validation', id: `validation-${task.id}` }],
    }
  }
}

function validationCommand(task: AutonomousTaskNode): string {
  const prefix = 'Run '
  if (!task.objective.startsWith(prefix)) {
    throw new Error(`Validation task ${task.id} does not contain an executable command.`)
  }
  const command = task.objective.slice(prefix.length).trim()
  if (command.length === 0) {
    throw new Error(`Validation task ${task.id} contains an empty command.`)
  }
  return command
}
