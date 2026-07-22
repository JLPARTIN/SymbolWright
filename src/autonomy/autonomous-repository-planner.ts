import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

export interface AutonomousRepositoryPlanRequest {
  readonly missionId: string
  readonly objective: string
  readonly repositoryRoot: string
  readonly index: RepositorySemanticIndexSnapshot
  readonly validationCommands: readonly string[]
  readonly now?: string | undefined
}

export interface AutonomousRepositoryPlan {
  readonly graph: AutonomousTaskGraph
  readonly affectedFiles: readonly string[]
  readonly matchedSymbols: readonly string[]
  readonly rationale: readonly string[]
}

export function planAutonomousRepositoryMission(
  request: AutonomousRepositoryPlanRequest,
): AutonomousRepositoryPlan {
  const now = request.now ?? new Date().toISOString()
  const objectiveTerms = tokenize(request.objective)
  const matchedSymbols = request.index.symbols.filter((symbol) =>
    objectiveTerms.some((term) => symbol.name.toLowerCase().includes(term)),
  )
  const matchedNames = new Set(matchedSymbols.map((symbol) => symbol.name))
  const affectedFiles = new Set(matchedSymbols.map((symbol) => symbol.filePath))

  for (const reference of request.index.references) {
    if (matchedNames.has(reference.symbolName)) affectedFiles.add(reference.filePath)
  }

  const analysisTasks: AutonomousTaskNode[] = [
    task(
      now,
      'analyze-architecture',
      'Inspect repository architecture and package boundaries',
      'repository-analysis',
      [],
      {
        reads: ['**/*'],
        writes: [],
      },
    ),
    task(
      now,
      'resolve-symbol-impact',
      'Resolve affected symbols, definitions, and references',
      'semantic-index',
      [],
      {
        reads: ['.codemind/repository-indexes/*'],
        writes: [],
      },
    ),
    task(
      now,
      'discover-validation',
      'Discover repository validation commands and conventions',
      'repository-analysis',
      [],
      {
        reads: ['package.json', '.github/workflows/**', 'tsconfig*.json'],
        writes: [],
      },
    ),
  ]

  const editTask = task(
    now,
    'execute-edit-session',
    request.objective,
    'edit-session',
    analysisTasks.map((entry) => entry.id),
    { reads: [...affectedFiles], writes: [...affectedFiles] },
  )

  const validationTasks = request.validationCommands.map((command, index) =>
    task(
      now,
      `validate-${index + 1}`,
      `Run ${command}`,
      'validation',
      index === 0 ? [editTask.id] : [`validate-${index}`],
      { reads: ['**/*'], writes: [] },
      2,
    ),
  )

  const graph: AutonomousTaskGraph = {
    schemaVersion: 1,
    missionId: request.missionId,
    objective: request.objective,
    createdAt: now,
    updatedAt: now,
    tasks: [...analysisTasks, editTask, ...validationTasks],
  }

  return {
    graph,
    affectedFiles: [...affectedFiles].sort(),
    matchedSymbols: [...matchedNames].sort(),
    rationale: [
      `Matched ${matchedNames.size} repository symbols from the objective.`,
      `Identified ${affectedFiles.size} files requiring impact review.`,
      `Scheduled ${analysisTasks.length} independent analysis tasks before editing.`,
      `Scheduled ${validationTasks.length} ordered validation tasks after editing.`,
    ],
  }
}

function task(
  now: string,
  id: string,
  objective: string,
  kind: AutonomousTaskNode['kind'],
  dependencies: readonly string[],
  resources: AutonomousTaskNode['resources'],
  maxAttempts = 1,
): AutonomousTaskNode {
  return {
    id,
    objective,
    kind,
    dependencies,
    resources,
    state: dependencies.length === 0 ? 'ready' : 'queued',
    retry: { maxAttempts, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: now,
    updatedAt: now,
  }
}

function tokenize(objective: string): string[] {
  return objective
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((term) => term.length >= 3)
}
