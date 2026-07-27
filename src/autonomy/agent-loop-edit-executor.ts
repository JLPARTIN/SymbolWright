import type { LLMProvider } from '../provider/provider.types.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../runtime/types.js'
import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopConfig, AgentLoopResult } from '../agent/agent-loop.types.js'
import type { MissionTaskExecutionResult } from './persistent-mission-executor.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import {
  type AutonomousEditExecutionContext,
  type AutonomousEditTaskExecutor,
} from './runtime-mission-task-executor.js'
import { planSemanticMultiFileEdit, type SemanticEditPlan } from './semantic-edit-orchestrator.js'
import type { AutonomousTaskNode } from './task-graph.types.js'
import type {
  RepositoryEditTransaction,
  RepositoryEditTransactionManager,
} from './transactional-repository-edit.js'

const DEFAULT_SYSTEM_PROMPT =
  'You are SymbolWright operating an autonomous repository edit task. Inspect before editing, use repository tools for every change, preserve existing conventions, and finish only after the requested change is implemented. Do not claim files changed unless tools actually changed them.'

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
  readonly loadSemanticIndex?: () => Promise<RepositorySemanticIndexSnapshot | undefined>
  readonly validationCommands?: readonly string[]
  readonly transactionManager?: RepositoryEditTransactionManager
}

/**
 * Executes edit and repair tasks through SymbolWright's existing tool-capable agent
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
  readonly #loadSemanticIndex:
    (() => Promise<RepositorySemanticIndexSnapshot | undefined>) | undefined
  readonly #validationCommands: readonly string[]
  readonly #transactionManager: RepositoryEditTransactionManager | undefined

  constructor(options: AgentLoopAutonomousEditExecutorOptions) {
    this.#provider = options.provider
    this.#tools = options.tools
    this.#toolContext = options.toolContext
    this.#repositoryRoot = options.repositoryRoot
    this.#model = options.model
    this.#maxIterations = options.maxIterations ?? 30
    this.#systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
    this.#runAgent = options.runAgent ?? runAgentLoop
    this.#readChangedFiles =
      options.readChangedFiles ?? (() => readGitChangedFiles(this.#repositoryRoot))
    this.#loadSemanticIndex = options.loadSemanticIndex
    this.#validationCommands = [...(options.validationCommands ?? [])]
    this.#transactionManager = options.transactionManager
  }

  async execute(
    task: AutonomousTaskNode,
    context?: AutonomousEditExecutionContext,
  ): Promise<MissionTaskExecutionResult> {
    const semanticIndex = await this.#loadSemanticIndex?.()
    const plan = planSemanticMultiFileEdit({
      task,
      index: semanticIndex,
      validationCommands: this.#validationCommands,
    })
    const transactionStart = await this.#transactionManager?.begin(plan, {
      ownedBaselineFiles: context?.ownedBaselineFiles ?? [],
    })
    if (transactionStart?.state === 'blocked') {
      return {
        state: 'blocked',
        diagnostics: transactionStart.diagnostics,
        artifacts: [semanticPlanArtifact(plan)],
        evidence: [{ kind: 'diagnostic', id: `transaction-conflict-${task.id}` }],
      }
    }

    const transaction = transactionStart?.transaction
    const before = transaction === undefined ? new Set(await this.#readChangedFiles()) : undefined
    let result: AgentLoopResult

    try {
      result = await this.#runAgent(
        this.#provider,
        buildTaskPrompt(task, plan),
        this.#tools,
        this.#toolContext,
        {
          maxIterations: this.#maxIterations,
          systemPrompt: this.#systemPrompt,
          ...(this.#model === undefined ? {} : { model: this.#model }),
        },
      )
    } catch (error) {
      const rolledBack = await this.#rollback(transaction)
      return {
        state: 'failed',
        diagnostics: [errorMessage(error), ...rollbackDiagnostics(rolledBack)],
        artifacts: enhancedArtifacts(plan, transaction, rolledBack),
        evidence: enhancedEvidence(task.id, [], plan, transaction),
      }
    }

    const toolCallIds = result.iterations.flatMap((iteration) =>
      iteration.toolCalls.map((call) => call.id),
    )
    const inspection =
      transaction === undefined ? undefined : await this.#transactionManager?.inspect(transaction)
    const after = inspection?.modifiedFiles ?? (await this.#readChangedFiles())
    const modifiedFiles =
      before === undefined ? [...after].sort() : after.filter((file) => !before.has(file)).sort()

    if (result.status !== 'completed') {
      const rolledBack = await this.#rollback(transaction)
      return {
        state: 'failed',
        diagnostics: [
          result.error ?? `Agent loop ended with status ${result.status}.`,
          ...rollbackDiagnostics(rolledBack),
        ],
        artifacts: [
          ...(result.finalText.length === 0 ? [] : [result.finalText]),
          ...enhancedArtifacts(plan, transaction, rolledBack),
        ],
        evidence: enhancedEvidence(task.id, toolCallIds, plan, transaction),
        ...(transaction === undefined ? { modifiedFiles } : { modifiedFiles: [] }),
      }
    }

    if ((inspection?.unexpectedFiles.length ?? 0) > 0) {
      const unexpectedFiles = inspection?.unexpectedFiles ?? []
      const rolledBack = await this.#rollback(transaction)
      return {
        state: 'blocked',
        diagnostics: [
          `Agent changed files outside the semantic edit scope: ${unexpectedFiles.join(', ')}`,
          ...rollbackDiagnostics(rolledBack),
        ],
        artifacts: [
          ...(result.finalText.length === 0 ? [] : [result.finalText]),
          ...enhancedArtifacts(plan, transaction, rolledBack),
        ],
        evidence: enhancedEvidence(task.id, toolCallIds, plan, transaction),
        modifiedFiles: [],
      }
    }

    if (modifiedFiles.length === 0) {
      return {
        state: 'blocked',
        diagnostics: [
          `Agent completed task ${task.id} without producing a verified repository change.`,
        ],
        artifacts: [
          ...(result.finalText.length === 0 ? [] : [result.finalText]),
          ...enhancedArtifacts(plan, transaction),
        ],
        evidence: enhancedEvidence(task.id, toolCallIds, plan, transaction),
      }
    }

    if (transaction !== undefined) await this.#transactionManager?.commit(transaction)
    return {
      state: 'completed',
      modifiedFiles,
      artifacts: [
        ...(result.finalText.length === 0 ? [] : [result.finalText]),
        ...enhancedArtifacts(plan, transaction),
      ],
      evidence: enhancedEvidence(task.id, toolCallIds, plan, transaction),
    }
  }

  async #rollback(transaction: RepositoryEditTransaction | undefined): Promise<readonly string[]> {
    if (transaction === undefined || this.#transactionManager === undefined) return []
    return this.#transactionManager.rollback(transaction)
  }
}

function buildTaskPrompt(task: AutonomousTaskNode, plan: SemanticEditPlan): string {
  const reads =
    task.resources.reads.length === 0 ? '(none declared)' : task.resources.reads.join(', ')
  const writes =
    task.resources.writes.length === 0 ? '(discover as needed)' : task.resources.writes.join(', ')
  const orderedWrites =
    plan.orderedWrites.length === 0
      ? '(discover from repository evidence)'
      : plan.orderedWrites.join(' -> ')
  const affectedImporters =
    plan.affectedImporters.length === 0 ? '(none known)' : plan.affectedImporters.join(', ')
  const validations =
    plan.validationCommands.length === 0
      ? '(discover repository validation)'
      : plan.validationCommands.join(', ')
  return [
    `Mission task: ${task.objective}`,
    `Task ID: ${task.id}`,
    `Task kind: ${task.kind}`,
    `Declared read scope: ${reads}`,
    `Declared write scope: ${writes}`,
    '',
    'Semantic multi-file plan:',
    `Write policy: ${plan.writePolicy}`,
    `Dependency-aware edit order: ${orderedWrites}`,
    `Known affected importers: ${affectedImporters}`,
    `Affected packages: ${plan.affectedPackages.join(', ') || '(none known)'}`,
    `Exported contracts: ${plan.exportedSymbols.join(', ') || '(none known)'}`,
    `Impact-guided validation: ${validations}`,
    '',
    'Execution protocol:',
    '1. Inspect all relevant definitions, references, tests, and package conventions before writing.',
    '2. Apply provider/dependency changes before importer changes using the ordered plan.',
    '3. Keep changes inside the declared or semantic impact scope.',
    '4. Review the final diff and run the listed validation commands when the task permits it.',
    'Inspect the current repository state, make the smallest complete change, and summarize what changed.',
  ].join('\n')
}

function enhancedEvidence(
  taskId: string,
  toolCallIds: readonly string[],
  plan: SemanticEditPlan,
  transaction: RepositoryEditTransaction | undefined,
): NonNullable<MissionTaskExecutionResult['evidence']> {
  const toolEvidence = toolCallIds.map((id) => ({ kind: 'tool-call' as const, id }))
  if (transaction === undefined) return toolEvidence
  return [
    ...toolEvidence,
    { kind: 'edit-session' as const, id: `semantic-plan-${taskId}` },
    { kind: 'checkpoint' as const, id: `transaction-${transaction.id}` },
  ]
}

function enhancedArtifacts(
  plan: SemanticEditPlan,
  transaction: RepositoryEditTransaction | undefined,
  rolledBack: readonly string[] = [],
): readonly string[] {
  if (transaction === undefined) return []
  return [
    semanticPlanArtifact(plan),
    `Repository edit transaction: ${transaction.id}`,
    ...(rolledBack.length === 0 ? [] : [`Rolled back files: ${rolledBack.join(', ')}`]),
  ]
}

function semanticPlanArtifact(plan: SemanticEditPlan): string {
  return [
    `Semantic edit plan ${plan.taskId}`,
    `write-policy=${plan.writePolicy}`,
    `ordered-files=${plan.orderedWrites.join(',') || 'discovery'}`,
    `validation=${plan.validationCommands.join(',') || 'discovery'}`,
  ].join('; ')
}

function rollbackDiagnostics(rolledBack: readonly string[]): readonly string[] {
  return rolledBack.length === 0
    ? []
    : [`Rolled back ${rolledBack.length} files changed by the failed edit transaction.`]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
