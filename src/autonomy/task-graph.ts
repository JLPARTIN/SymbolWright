import type {
  AutonomousTaskGraph,
  AutonomousTaskGraphFinding,
  AutonomousTaskGraphValidation,
} from './task-graph.types.js'

export function validateAutonomousTaskGraph(
  graph: AutonomousTaskGraph,
): AutonomousTaskGraphValidation {
  const findings: AutonomousTaskGraphFinding[] = []
  const tasksById = new Map<string, (typeof graph.tasks)[number]>()

  for (const task of graph.tasks) {
    if (tasksById.has(task.id)) {
      findings.push({
        code: 'DUPLICATE_TASK_ID',
        taskId: task.id,
        message: `Task ID ${task.id} is duplicated.`,
      })
    } else {
      tasksById.set(task.id, task)
    }

    if (task.retry.maxAttempts < 1 || task.retry.attempts < 0) {
      findings.push({
        code: 'INVALID_RETRY_POLICY',
        taskId: task.id,
        message: `Task ${task.id} has an invalid retry policy.`,
      })
    }

    for (const dependency of task.dependencies) {
      if (dependency === task.id) {
        findings.push({
          code: 'SELF_DEPENDENCY',
          taskId: task.id,
          message: `Task ${task.id} depends on itself.`,
        })
      }
    }
  }

  for (const task of graph.tasks) {
    for (const dependency of task.dependencies) {
      if (!tasksById.has(dependency)) {
        findings.push({
          code: 'MISSING_DEPENDENCY',
          taskId: task.id,
          message: `Task ${task.id} depends on missing task ${dependency}.`,
        })
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) {
      findings.push({
        code: 'DEPENDENCY_CYCLE',
        taskId,
        message: `Dependency cycle detected at task ${taskId}.`,
      })
      return
    }
    if (visited.has(taskId)) return

    const task = tasksById.get(taskId)
    if (task === undefined) return

    visiting.add(taskId)
    for (const dependency of task.dependencies) visit(dependency)
    visiting.delete(taskId)
    visited.add(taskId)
  }

  for (const task of graph.tasks) visit(task.id)

  return { valid: findings.length === 0, findings }
}
