import {
  assessMergeReadiness,
  type MergeReadinessAssessment,
  type MergeReadinessValidation,
} from './merge-readiness-assessment.js'
import type { PersistedMissionExecution } from './persistent-mission-executor.js'
import {
  analyzeRepositoryImpact,
  type RepositoryImpactAnalysis,
} from './repository-impact-analysis.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

export interface MissionImpactIntelligence {
  readonly impact: RepositoryImpactAnalysis
  readonly mergeReadiness: MergeReadinessAssessment
}

export function createMissionImpactIntelligence(input: {
  readonly execution: PersistedMissionExecution
  readonly semanticIndex: RepositorySemanticIndexSnapshot
  readonly validationCommands?: readonly string[]
}): MissionImpactIntelligence {
  const validationTasks = input.execution.graph.tasks.filter(
    (task) => task.kind === 'validation',
  )
  const validationCommands =
    input.validationCommands === undefined
      ? validationTasks.map((task) => validationCommand(task.objective))
      : input.validationCommands
  const impact = analyzeRepositoryImpact(input.semanticIndex, input.execution.modifiedFiles, {
    validationCommands,
  })
  const validations = validationTasks.flatMap(validationResult)
  const unresolvedDiagnostics = input.execution.graph.tasks
    .filter((task) => task.state !== 'completed')
    .flatMap((task) => task.failureDiagnostics)
  const evidenceCount = input.execution.graph.tasks.reduce(
    (count, task) => count + task.evidence.length,
    0,
  )

  return {
    impact,
    mergeReadiness: assessMergeReadiness({
      impact,
      validations,
      unresolvedDiagnostics,
      evidenceCount,
    }),
  }
}

function validationResult(task: AutonomousTaskNode): readonly MergeReadinessValidation[] {
  if (task.state !== 'completed' && task.state !== 'failed') return []
  return [
    {
      command: validationCommand(task.objective),
      passed: task.state === 'completed',
      ...(task.startedAt === undefined || task.completedAt === undefined
        ? {}
        : {
            durationMs: Math.max(
              0,
              Date.parse(task.completedAt) - Date.parse(task.startedAt),
            ),
          }),
    },
  ]
}

function validationCommand(objective: string): string {
  return objective.startsWith('Run ') ? objective.slice(4) : objective
}
