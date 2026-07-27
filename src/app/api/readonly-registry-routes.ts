import type { IncomingMessage, ServerResponse } from 'node:http'

import { bridgeToolsForProvider } from '../../agent/tool-schema-bridge.js'
import {
  canAccessMission,
  resolveMissionVisibility,
  type TeamVisibilitySource,
} from '../../access/mission-access-guard.js'
import {
  getCheckpoint,
  listCheckpoints,
  type CheckpointSummary,
} from '../../checkpoint/checkpoint-service.js'
import type { CheckpointMetadata } from '../../checkpoint/checkpoint-types.js'
import type { MissionService } from '../../mission/mission-service.js'
import {
  listProceduralEntries,
  listRecentEpisodicInteractions,
  openMemoryDatabaseReadOnly,
  type EpisodicSummary,
  type ProceduralSummary,
} from '../../memory/memory-browse.js'
import { createRuntimePolicyForMode } from '../../runtime/policy/runtime-policy.js'
import { assembleAgentTools, DYNAMICALLY_WIRED_TOOLS } from '../../runtime/tools/tool-assembly.js'
import type { SymbolWrightRuntimeMode } from '../../runtime/types.js'
import { SYMBOLWRIGHT_RUNTIME_MODES } from '../../runtime/policy/runtime-policy.js'

export interface ReadonlyRegistryContext {
  readonly cwd: string
  readonly hasGitHubToken: boolean
  /** Undefined = operator (unrestricted), matching the convention used throughout `access/` --
   * an agent grant id otherwise. Used to scope memory (operator-only for now, see below) and
   * checkpoint visibility to missions the caller can actually access. */
  readonly callerGrantId?: string
  readonly missionService?: MissionService
  readonly teamSource?: TeamVisibilitySource
}

/**
 * A checkpoint's `sessionId` equals the owning mission's id when it was created during a
 * mission-linked agent turn (see `toolContext.sessionId` in `symbolwright-chat-server.ts`).
 * Returns `true` when a delegated caller may see checkpoints for this session: the operator can
 * always see everything; a delegated caller needs `sessionId` to resolve to a mission it can
 * read. A session that doesn't correspond to any known mission (an ad hoc, non-mission chat) has
 * no ownership information to check against, so it fails closed -- operator-only, same as memory
 * below -- rather than guessing at who may have created it.
 */
function callerCanSeeSession(sessionId: string, context: ReadonlyRegistryContext): boolean {
  if (context.callerGrantId === undefined) return true
  if (context.missionService === undefined) return false
  let mission
  try {
    mission = context.missionService.get(sessionId)
  } catch {
    return false
  }
  const visibility = resolveMissionVisibility(context.callerGrantId, context.teamSource)
  return canAccessMission(mission, visibility, 'read').allowed
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

interface ToolSummary {
  readonly name: string
  readonly description: string
  readonly capability: string
}

/**
 * `GET /api/tools` — the real 41-tool static registry plus the 5
 * dynamically-wired tool names, kept as separate fields (not merged into
 * one interchangeable list) because `assembleAgentTools()` has no static
 * definition for the dynamic tools; their reachability comes from the
 * activation registry, not from re-running `bridgeToolsForProvider`
 * against definitions that don't exist for them.
 */
export function handleToolsRegistry(res: ServerResponse): void {
  const staticTools: readonly ToolSummary[] = assembleAgentTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    capability: tool.capability,
  }))

  const dynamicTools: readonly { readonly name: string }[] = DYNAMICALLY_WIRED_TOOLS.map(
    (name) => ({ name }),
  )

  const modes: Record<SymbolWrightRuntimeMode, readonly string[]> = Object.fromEntries(
    SYMBOLWRIGHT_RUNTIME_MODES.map((mode) => {
      const policy = createRuntimePolicyForMode(mode, { hasGitHubToken: false })
      const reachable = bridgeToolsForProvider(assembleAgentTools(), policy).map(
        (bridged) => bridged.providerTool.name,
      )
      return [mode, reachable] as const
    }),
  ) as unknown as Record<SymbolWrightRuntimeMode, readonly string[]>

  sendJson(res, 200, { staticTools, dynamicTools, modes })
}

/**
 * `GET /api/memory/recent?limit=N` -- operator-only for now. The underlying episodic-memory
 * schema has no repository/mission/grant column at all (it is one process-global database, not
 * scoped by policy), so there is no data to filter a delegated caller's view by; exposing it
 * unfiltered to any grant would leak every other grant's interaction history. Revisit once
 * memory records carry a real scoping key.
 */
export function handleMemoryRecent(
  req: IncomingMessage,
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  if (context.callerGrantId !== undefined) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam !== null ? Number.parseInt(limitParam, 10) : 50

  const db = openMemoryDatabaseReadOnly(context.cwd)
  try {
    const interactions: readonly EpisodicSummary[] = listRecentEpisodicInteractions(
      db,
      Number.isFinite(limit) && limit > 0 ? limit : 50,
    )
    sendJson(res, 200, {
      interactions,
      note:
        interactions.length === 0
          ? 'No local memory database yet — created on first agent session.'
          : undefined,
    })
  } finally {
    db.close()
  }
}

/** `GET /api/memory/procedural` -- operator-only for the same reason as `handleMemoryRecent`. */
export function handleMemoryProcedural(
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  if (context.callerGrantId !== undefined) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  const categories: readonly ProceduralSummary[] = listProceduralEntries(context.cwd)
  sendJson(res, 200, { categories })
}

/** `GET /api/checkpoints?session=...` -- with `session` supplied, denies (`404`) a delegated
 * caller who can't see that session's mission. Without `session` (list across every session),
 * filters the unscoped result down to sessions the caller can see rather than returning
 * everyone's checkpoints. */
export function handleCheckpointsList(
  req: IncomingMessage,
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sessionId = url.searchParams.get('session') ?? undefined
  if (sessionId !== undefined && !callerCanSeeSession(sessionId, context)) {
    sendJson(res, 404, { error: `Session not found: ${sessionId}` })
    return
  }
  const all: readonly CheckpointSummary[] = listCheckpoints(context.cwd, sessionId)
  const checkpoints =
    sessionId !== undefined
      ? all
      : all.filter((checkpoint) => callerCanSeeSession(checkpoint.sessionId, context))
  sendJson(res, 200, { checkpoints })
}

/** `GET /api/checkpoints/:id` */
export function handleCheckpointDetail(
  checkpointId: string,
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  const checkpoint: CheckpointMetadata | undefined = getCheckpoint(context.cwd, checkpointId)
  if (checkpoint === undefined || !callerCanSeeSession(checkpoint.sessionId, context)) {
    sendJson(res, 404, { error: `Checkpoint not found: ${checkpointId}` })
    return
  }
  sendJson(res, 200, { checkpoint })
}
