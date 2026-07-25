import { randomUUID } from 'node:crypto'

import { DEFAULT_RUNTIME_PROTECTED_PATHS } from '../runtime/policy/runtime-policy.js'
import type {
  ChangeCandidate,
  ConflictCategory,
  DetectedConflict,
} from './change-candidate-types.js'
import type { CollaborativeTask } from './collaborative-task-types.js'

function touchesProtectedPath(filePath: string, protectedPaths: readonly string[]): boolean {
  return protectedPaths.some(
    (protectedPath) => filePath === protectedPath || filePath.startsWith(`${protectedPath}/`),
  )
}

function withinScope(filePath: string, scope: readonly string[]): boolean {
  if (scope.length === 0) return true
  return scope.some((allowed) => filePath === allowed || filePath.startsWith(`${allowed}/`))
}

function conflict(
  category: ConflictCategory,
  candidateIds: readonly string[],
  description: string,
  filePaths: readonly string[],
  blocking = true,
): DetectedConflict {
  return { id: randomUUID(), category, candidateIds, description, filePaths, blocking }
}

export interface DetectConflictsOptions {
  readonly canonicalBaseSha: string
  readonly protectedPaths?: readonly string[]
  /** Keyed by task id, from `CollaborativeTask.writePaths` — undefined/empty means unscoped. */
  readonly taskWriteScopeById?: ReadonlyMap<string, readonly string[]>
}

/**
 * Detects integration-blocking conflicts among a set of proposed `ChangeCandidate`s before they
 * ever reach the integration engine (Section 21) — deliberately broader than Git's own textual
 * merge-conflict detection, since two candidates can merge cleanly at the text level while still
 * being semantically or scope-incompatible (e.g. both silently touching the same file, or one
 * candidate reaching outside its task's declared write scope).
 */
export function detectConflicts(
  candidates: readonly ChangeCandidate[],
  options: DetectConflictsOptions,
): readonly DetectedConflict[] {
  const conflicts: DetectedConflict[] = []
  const protectedPaths = options.protectedPaths ?? DEFAULT_RUNTIME_PROTECTED_PATHS

  for (const candidate of candidates) {
    if (candidate.baseSha !== options.canonicalBaseSha) {
      conflicts.push(
        conflict(
          'branch-base-drift',
          [candidate.id],
          `Candidate base SHA "${candidate.baseSha}" no longer matches the canonical integration SHA "${options.canonicalBaseSha}".`,
          candidate.changedFiles.map((f) => f.path),
        ),
      )
    }

    const protectedTouches = candidate.changedFiles
      .map((f) => f.path)
      .filter((filePath) => touchesProtectedPath(filePath, protectedPaths))
    if (protectedTouches.length > 0) {
      conflicts.push(
        conflict(
          'protected-path-conflict',
          [candidate.id],
          `Candidate touches protected path(s): ${protectedTouches.join(', ')}.`,
          protectedTouches,
        ),
      )
    }

    const scope = options.taskWriteScopeById?.get(candidate.taskId)
    if (scope !== undefined && scope.length > 0) {
      const outOfScope = candidate.changedFiles
        .map((f) => f.path)
        .filter((filePath) => !withinScope(filePath, scope))
      if (outOfScope.length > 0) {
        conflicts.push(
          conflict(
            'permission-scope-conflict',
            [candidate.id],
            `Candidate touches file(s) outside its task's declared write scope: ${outOfScope.join(', ')}.`,
            outOfScope,
          ),
        )
      }
    }
  }

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i]
      const b = candidates[j]
      if (a === undefined || b === undefined) continue
      const aPaths = new Set(a.changedFiles.map((f) => f.path))
      const overlap = b.changedFiles.map((f) => f.path).filter((p) => aPaths.has(p))
      if (overlap.length > 0) {
        conflicts.push(
          conflict(
            'textual-overlap',
            [a.id, b.id],
            `Candidates "${a.id}" and "${b.id}" both modify: ${overlap.join(', ')}.`,
            overlap,
          ),
        )
      }
    }
  }

  return conflicts
}

/** Builds the `taskWriteScopeById` map `detectConflicts` expects, from a team's task list. */
export function buildTaskWriteScopeMap(
  tasks: readonly CollaborativeTask[],
): ReadonlyMap<string, readonly string[]> {
  return new Map(tasks.map((task) => [task.id, task.writePaths ?? []]))
}
