import {
  finalizeQuarantine,
  pruneAcquisitionRoot,
  quarantineOrphanedWorkspaces,
  type FinalizeQuarantineResult,
  type QuarantineOrphanedWorkspacesResult,
} from './github/repository-acquisition-retention.js'
import { MissionService } from './mission/mission-service.js'

export interface PruneReposCommandArgs {
  readonly json: boolean
  /** Only quarantine newly-orphaned workspaces; skip finalizing (recheck-then-delete-or-restore)
   * anything already in quarantine. */
  readonly quarantineOnly: boolean
  /** Only finalize what is already quarantined; skip scanning for newly-orphaned workspaces. */
  readonly finalizeOnly: boolean
}

export function parsePruneReposArgs(args: readonly string[]): PruneReposCommandArgs {
  let json = false
  let quarantineOnly = false
  let finalizeOnly = false
  for (const arg of args) {
    if (arg === '--json') json = true
    else if (arg === '--quarantine-only') quarantineOnly = true
    else if (arg === '--finalize-only') finalizeOnly = true
    else throw new Error(`Unknown prune-repos flag: ${arg}`)
  }
  if (quarantineOnly && finalizeOnly) {
    throw new Error('--quarantine-only and --finalize-only are mutually exclusive')
  }
  return { json, quarantineOnly, finalizeOnly }
}

type PruneReposResult = QuarantineOrphanedWorkspacesResult & FinalizeQuarantineResult

/**
 * Operator-invocable retention sweep for acquired external-repository workspaces
 * (`.symbolwright/external-repos/`): quarantines anything no retained mission references, then
 * finalizes (deletes, or restores if referenced again since) whatever in quarantine has aged
 * past its grace window or is pushing the quarantine directory over its retention budget.
 */
export async function runPruneReposCommand(cwd: string, args: readonly string[]): Promise<string> {
  const parsed = parsePruneReposArgs(args)
  const missionService = new MissionService({ workspaceRoot: cwd })
  const sweepOptions = { workspaceRoot: cwd, missionService }

  let result: PruneReposResult
  if (parsed.quarantineOnly) {
    result = {
      ...(await quarantineOrphanedWorkspaces(sweepOptions)),
      deleted: [],
      restored: [],
      stillWithinGrace: 0,
    }
  } else if (parsed.finalizeOnly) {
    result = { quarantined: [], skippedReferenced: 0, ...(await finalizeQuarantine(sweepOptions)) }
  } else {
    result = await pruneAcquisitionRoot(sweepOptions)
  }

  if (parsed.json) return JSON.stringify(result, null, 2)

  const lines = [
    'SymbolWright external-repository retention sweep',
    '',
    `Quarantined (newly orphaned): ${result.quarantined.length}`,
    ...result.quarantined.map((entry) => `  - ${entry}`),
    `Skipped (still referenced by a retained mission): ${result.skippedReferenced}`,
    `Deleted (grace window elapsed or over budget): ${result.deleted.length}`,
    ...result.deleted.map((entry) => `  - ${entry}`),
    `Restored (referenced again during the grace window): ${result.restored.length}`,
    ...result.restored.map((entry) => `  - ${entry}`),
    `Still within grace window: ${result.stillWithinGrace}`,
  ]
  return lines.join('\n')
}
