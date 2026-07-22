import type {
  MissionTaskExecutionResult,
  MissionTaskExecutor,
} from './persistent-mission-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'
import type { AutonomousValidationRunner } from './autonomous-repair-loop.js'

export interface AutonomousEditTaskExecutor {
  execute(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult>
}

export interface RuntimeMissionTaskExecutorOptions {
  readonly repositoryRoot: string
  readonly validationRunner: AutonomousValidationRunner
  readonly editExecutor?: AutonomousEditTaskExecutor
}

/**
 * Production mission-task adapter.
 *
 * Analysis tasks produce durable evidence, validation tasks use CodeMind's
 * policy-aware validation runner, and edit tasks require an explicitly wired
 * editing strategy. An absent editing strategy is reported as blocked rather
 * than pretending repository changes were applied.
 */
export class RuntimeMissionTaskExecutor implements MissionTaskExecutor {
  readonly #repositoryRoot: string
  readonly #validationRunner: AutonomousValidationRunner
  readonly #editExecutor: AutonomousEditTaskExecutor | undefined

  constructor(options: RuntimeMissionTaskExecutorOptions) {
    this.#repositoryRoot = options.repositoryRoot
    this.#validationRunner = options.validationRunner
    this.#editExecutor = options.editExecutor
  }

  async execute(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult> {
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
          evidence: [
            {
              kind: 'operator-note',
              id: `blocked-${task.id}`,
              summary: 'Mission paused before repository writes because no real edit strategy was available.',
            },
          ],
        }
      }
      return this.#editExecutor.execute(task)
    }

    return {
      state: 'completed',
      evidence: [
        {
          kind: 'repository-analysis',
          id: `analysis-${task.id}`,
          summary: task.objective,
        },
      ],
      artifacts: [...task.resources.reads],
    }
  }

  async #executeValidation(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult> {
    const command = validationCommand(task)
    const result = await this.#validationRunner.run({
      repositoryRoot: this.#repositoryRoot,
      phase: task.id,
      command,
    })

    return {
      state: result.passed ? 'completed' : 'failed',
      diagnostics: result.passed
        ? []
        : [result.stderr || result.stdout || `${command} exited with code ${result.exitCode}`],
      artifacts: [command],
      evidence: [
        {
          kind: 'validation',
          id: `validation-${task.id}`,
          summary: `${command}: ${result.passed ? 'passed' : 'failed'} in ${result.durationMs}ms`,
        },
      ],
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
