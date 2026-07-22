import type { LLMProvider } from '../provider/provider.types.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../runtime/types.js'
import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopConfig, AgentLoopResult } from '../agent/agent-loop.types.js'
import type { MissionTaskExecutionResult } from './persistent-mission-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'
import type { AutonomousEditTaskExecutor } from './runtime-mission-task-executor.js'

const DEFAULT_SYSTEM_PROMPT =
  'You are CodeMind operating an autonomous repository edit task. Inspect before editing, use repository tools for every change, preserve existing conventions, and finish only after the requested change is implemented. Do not claim files changed unless tools actually changed them.'

export interface AgentLoopRunner {
  (
    provider: LLMProvider,
    userMessage: string,
    tools: readonly RuntimeToolDefinition[],
    toolContext: RuntimeToolContext,
    config: AgentLoopConfig,
  ): Promise<AgentLoopResult>
}

export interface AgentLoopAutonomousEditExecutorOptions {
  readonly provider: LLMProvider
  readonly tools: readonly RuntimeToolDefinition[]
  readonly toolContext: RuntimeToolContext
  readonly repositoryRoot: string
  readonly model?: string
  readonly maxIterations?: number
  readonly systemPrompt?: string
  readonly runAgent?: AgentLoopRunner
  readonly readChangedFiles?: () => Promise<readonly string[]>
}

/**
 * Executes edit and repair tasks through CodeMind's existing tool-capable agent
 * loop, then verifies the repository changed before reporting completion.
 */
export class AgentLoopAutonomousEditExecutor implements AutonomousEditTaskExecutor {
  readonly #provider: LLMProvider
  readonly #tools: readonly RuntimeToolDefinition[]
  readonly #toolContext: RuntimeToolContext
  readonly #repositoryRoot: string
  readonly #model: string | undefined
  readonly #maxIterations: number
  readonly #systemPrompt: string
  readonly #runAgent: AgentLoopRunner
  readonly #readChangedFiles: () => Promise<readonly string[]>

  constructor(options: AgentLoopAutonomousEditExecutorOptions) {
    this.#provider = options.provider
    this.#tools = options.tools
    this.#toolContext = options.toolContext
    this.#repositoryRoot = options.repositoryRoot
    this.#model = options.model
    this.#maxIterations = options.maxIterations ?? 30
    this.#systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
    this.#runAgent = options.runAgent ?? runAgentLoop
    this.#readChangedFiles = options.readChangedFiles ?? (() => readGitChangedFiles(this.#repositoryRoot))
  }

  async execute(task: AutonomousTaskNode): Promise<MissionTaskExecutionResult> {
    const before = new Set(await this.#readChangedFiles())
    const result = await this.#runAgent(
      this.#provider,
      buildTaskPrompt(task),
      this.#tools,
      this.#toolContext,
      {
        maxIterations: this.#maxIterations,
        systemPrompt: this.#systemPrompt,
        ...(this.#model === undefined ? {} : { model: this.#model }),
      },
    )
    const after = await this.#readChangedFiles()
    const modifiedFiles = after.filter((file) => !before.has(file)).sort()
    const toolCallIds = result.iterations.flatMap((iteration) =>
      iteration.toolCalls.map((call) => call.id),
    )

    if (result.status !== 'completed') {
      return {
        state: 'failed',
        diagnostics: [result.error ?? `Agent loop ended with status ${result.status}.`],
        artifacts: result.finalText.length === 0 ? [] : [result.finalText],
        evidence: toolCallIds.map((id) => ({ kind: 'tool-call' as const, id })),
        modifiedFiles,
      }
    }

    if (modifiedFiles.length === 0) {
      return {
        state: 'blocked',
        diagnostics: [
          `Agent completed task ${task.id} without producing a verified repository change.`,
        ],
        artifacts: result.finalText.length === 0 ? [] : [result.finalText],
        evidence: toolCallIds.map((id) => ({ kind: 'tool-call' as const, id })),
      }
    }

    return {
      state: 'completed',
      modifiedFiles,
      artifacts: result.finalText.length === 0 ? [] : [result.finalText],
      evidence: toolCallIds.map((id) => ({ kind: 'tool-call' as const, id })),
    }
  }
}

function buildTaskPrompt(task: AutonomousTaskNode): string {
  const reads = task.resources.reads.length === 0 ? '(none declared)' : task.resources.reads.join(', ')
  const writes =
    task.resources.writes.length === 0 ? '(discover as needed)' : task.resources.writes.join(', ')
  return [
    `Mission task: ${task.objective}`,
    `Task ID: ${task.id}`,
    `Task kind: ${task.kind}`,
    `Declared read scope: ${reads}`,
    `Declared write scope: ${writes}`,
    'Inspect the current repository state, make the smallest complete change, and summarize what changed.',
  ].join('\n')
}

export async function readGitChangedFiles(repositoryRoot: string): Promise<readonly string[]> {
  const result = await runGitCommand(['status', '--porcelain=v1'], repositoryRoot)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Could not inspect repository changes.')
  }
  return parseGitStatusPaths(result.stdout)
}

export function parseGitStatusPaths(output: string): readonly string[] {
  const paths = output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 4)
    .map((line) => {
      const rawPath = line.slice(3)
      const renameSeparator = ' -> '
      const renameIndex = rawPath.lastIndexOf(renameSeparator)
      return renameIndex === -1 ? rawPath : rawPath.slice(renameIndex + renameSeparator.length)
    })
    .filter((path) => path.length > 0)
  return [...new Set(paths)].sort()
}
