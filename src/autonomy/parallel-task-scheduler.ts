import type { AutonomousTaskGraph, AutonomousTaskNode } from './task-graph.types.js'
import { validateAutonomousTaskGraph } from './task-graph.js'

export interface AutonomousScheduleBatch {
  readonly taskIds: readonly string[]
  readonly deferredTaskIds: readonly string[]
}

export function selectRunnableTaskBatch(
  graph: AutonomousTaskGraph,
  concurrencyLimit: number,
): AutonomousScheduleBatch {
  if (concurrencyLimit < 1) {
    throw new Error('Concurrency limit must be at least 1.')
  }

  const validation = validateAutonomousTaskGraph(graph)
  if (!validation.valid) {
    throw new Error(
      `Cannot schedule invalid task graph: ${validation.findings.map((finding) => finding.message).join(' ')}`,
    )
  }

  const completed = new Set(
    graph.tasks.filter((task) => task.state === 'completed').map((task) => task.id),
  )
  const candidates = graph.tasks.filter(
    (task) =>
      (task.state === 'queued' || task.state === 'ready' || task.state === 'interrupted') &&
      task.dependencies.every((dependency) => completed.has(dependency)) &&
      task.retry.attempts < task.retry.maxAttempts,
  )

  const selected: AutonomousTaskNode[] = []
  const deferred: string[] = []

  for (const candidate of candidates) {
    if (
      selected.length >= concurrencyLimit ||
      selected.some((task) => tasksConflict(task, candidate))
    ) {
      deferred.push(candidate.id)
      continue
    }
    selected.push(candidate)
  }

  return {
    taskIds: selected.map((task) => task.id),
    deferredTaskIds: deferred,
  }
}

export function tasksConflict(left: AutonomousTaskNode, right: AutonomousTaskNode): boolean {
  const leftWrites = new Set(left.resources.writes.map(normalizeResource))
  const rightWrites = new Set(right.resources.writes.map(normalizeResource))
  const leftReads = new Set(left.resources.reads.map(normalizeResource))
  const rightReads = new Set(right.resources.reads.map(normalizeResource))

  return (
    intersects(leftWrites, rightWrites) ||
    intersects(leftWrites, rightReads) ||
    intersects(rightWrites, leftReads)
  )
}

function normalizeResource(resource: string): string {
  return resource.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const leftResource of left) {
    for (const rightResource of right) {
      if (
        leftResource === rightResource ||
        leftResource.startsWith(`${rightResource}/`) ||
        rightResource.startsWith(`${leftResource}/`)
      ) {
        return true
      }
    }
  }
  return false
}
