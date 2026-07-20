import { randomUUID } from 'node:crypto'

import { sanitizeMissionPayload } from './mission-redaction.js'
import type { MissionEvent } from './mission-types.js'

export const MISSION_EVENT_FILTERS = [
  'all',
  'agent',
  'files',
  'tools',
  'validation',
  'git',
  'checkpoints',
  'memory',
  'web-mcp',
  'subagents-skills',
] as const
export type MissionEventFilter = (typeof MISSION_EVENT_FILTERS)[number]

const MAX_SUMMARY_CHARS = 500

export interface CreateMissionEventInput {
  readonly missionId: string
  readonly type: string
  readonly summary: string
  readonly timestamp?: string
  readonly payload?: unknown
  readonly eventId?: string
}

export function createMissionEvent(
  input: CreateMissionEventInput,
  env: NodeJS.ProcessEnv = process.env,
): MissionEvent {
  const summary = input.summary.trim().slice(0, MAX_SUMMARY_CHARS)
  if (summary.length === 0) throw new Error('Mission event summary must not be empty')
  if (input.type.trim().length === 0) throw new Error('Mission event type must not be empty')

  const payload =
    input.payload === undefined ? undefined : sanitizeMissionPayload(input.payload, env)
  return {
    eventId: input.eventId ?? `event_${randomUUID()}`,
    missionId: input.missionId,
    type: input.type.trim(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    summary,
    ...(payload === undefined ? {} : { payload }),
  }
}

export function eventMatchesFilter(event: MissionEvent, filter: MissionEventFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'agent') return event.type.startsWith('agent.')
  if (filter === 'files')
    return event.type.startsWith('workspace.file') || event.type.startsWith('workspace.diff')
  if (filter === 'tools') return event.type.startsWith('agent.tool')
  if (filter === 'validation') return event.type.startsWith('validation.')
  if (filter === 'git') return event.type.startsWith('git.') || event.type.startsWith('github.')
  if (filter === 'checkpoints') return event.type.startsWith('checkpoint.')
  if (filter === 'memory') return event.type.startsWith('memory.')
  if (filter === 'web-mcp') return event.type.startsWith('web.') || event.type.startsWith('mcp.')
  return event.type.startsWith('subagent.') || event.type.startsWith('skill.')
}

export function paginateMissionEvents(
  events: readonly MissionEvent[],
  options: {
    readonly offset?: number
    readonly limit?: number
    readonly filter?: MissionEventFilter
  } = {},
): {
  readonly events: readonly MissionEvent[]
  readonly total: number
  readonly offset: number
  readonly limit: number
} {
  const offset = Math.max(0, Math.floor(options.offset ?? 0))
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 100)))
  const filter = options.filter ?? 'all'
  const matching = events.filter((event) => eventMatchesFilter(event, filter))
  return { events: matching.slice(offset, offset + limit), total: matching.length, offset, limit }
}

function operationKey(event: MissionEvent): string | undefined {
  const operationId =
    event.payload?.['operationId'] ??
    event.payload?.['toolCallId'] ??
    event.payload?.['validationId']
  return typeof operationId === 'string' && operationId.length > 0 ? operationId : undefined
}

function isStartedEvent(event: MissionEvent): boolean {
  return event.type.endsWith('.started')
}

function isTerminalEvent(event: MissionEvent): boolean {
  return (
    event.type.endsWith('.completed') ||
    event.type.endsWith('.failed') ||
    event.type.endsWith('.blocked') ||
    event.type.endsWith('.interrupted')
  )
}

/**
 * Produces synthetic interruption events for executions that were durably
 * recorded as started but never reached a terminal event before shutdown.
 */
export function recoverInterruptedMissionEvents(
  missionId: string,
  events: readonly MissionEvent[],
  timestamp = new Date().toISOString(),
): readonly MissionEvent[] {
  const pending = new Map<string, MissionEvent>()

  for (const event of events) {
    const key = operationKey(event)
    if (key === undefined) continue
    if (isStartedEvent(event)) pending.set(key, event)
    if (isTerminalEvent(event)) pending.delete(key)
  }

  return [...pending.entries()].map(([operationId, started]) => {
    const baseType = started.type.slice(0, -'.started'.length)
    return createMissionEvent({
      missionId,
      type: `${baseType}.interrupted`,
      timestamp,
      summary: `${started.summary} was interrupted before completion.`,
      payload: { operationId, startedEventId: started.eventId },
    })
  })
}
