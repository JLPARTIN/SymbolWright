import type { IncomingMessage, ServerResponse } from 'node:http'

import { bridgeToolsForProvider } from '../../agent/tool-schema-bridge.js'
import {
  getCheckpoint,
  listCheckpoints,
  type CheckpointSummary,
} from '../../checkpoint/checkpoint-service.js'
import type { CheckpointMetadata } from '../../checkpoint/checkpoint-types.js'
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

/** `GET /api/memory/recent?limit=N` */
export function handleMemoryRecent(
  req: IncomingMessage,
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
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

/** `GET /api/memory/procedural` */
export function handleMemoryProcedural(
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  const categories: readonly ProceduralSummary[] = listProceduralEntries(context.cwd)
  sendJson(res, 200, { categories })
}

/** `GET /api/checkpoints?session=...` */
export function handleCheckpointsList(
  req: IncomingMessage,
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sessionId = url.searchParams.get('session') ?? undefined
  const checkpoints: readonly CheckpointSummary[] = listCheckpoints(context.cwd, sessionId)
  sendJson(res, 200, { checkpoints })
}

/** `GET /api/checkpoints/:id` */
export function handleCheckpointDetail(
  checkpointId: string,
  res: ServerResponse,
  context: ReadonlyRegistryContext,
): void {
  const checkpoint: CheckpointMetadata | undefined = getCheckpoint(context.cwd, checkpointId)
  if (checkpoint === undefined) {
    sendJson(res, 404, { error: `Checkpoint not found: ${checkpointId}` })
    return
  }
  sendJson(res, 200, { checkpoint })
}
