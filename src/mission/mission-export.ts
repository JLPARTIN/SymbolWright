import { migrateMissionRecord } from './mission-migration.js'
import { redactMissionRecord } from './mission-redaction.js'
import type { MissionEvent, MissionExportBundle } from './mission-types.js'
import { MissionValidationError } from './mission-validation.js'

export const MAX_MISSION_IMPORT_BYTES = 4 * 1024 * 1024
export const MAX_MISSION_IMPORT_EVENTS = 20_000

export function createMissionExportBundle(
  mission: MissionExportBundle['mission'],
  events: readonly MissionEvent[],
  options: { readonly exportedAt?: string; readonly warnings?: readonly string[] } = {},
  env: NodeJS.ProcessEnv = process.env,
): MissionExportBundle {
  const bundle: MissionExportBundle = {
    kind: 'symbolwright.mission.bundle',
    schemaVersion: 1,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    mission,
    events,
    warnings: options.warnings ?? [
      'Repository file contents, checkpoint snapshots, provider credentials, and environment secrets are not included.',
    ],
  }
  return redactMissionRecord(bundle, env)
}

export function serializeMissionExportBundle(bundle: MissionExportBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

export function parseMissionExportBundle(
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
): MissionExportBundle {
  const byteLength = Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw), 'utf8')
  if (byteLength > MAX_MISSION_IMPORT_BYTES) {
    throw new MissionValidationError(`Mission import exceeds ${MAX_MISSION_IMPORT_BYTES} bytes`)
  }

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new MissionValidationError('Mission import must be valid JSON')
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MissionValidationError('Mission import must be a JSON object')
  }
  const record = parsed as Record<string, unknown>
  if (record['kind'] !== 'symbolwright.mission.bundle' || record['schemaVersion'] !== 1) {
    throw new MissionValidationError('Unsupported mission bundle kind or schema version')
  }
  if (typeof record['exportedAt'] !== 'string' || Number.isNaN(Date.parse(record['exportedAt']))) {
    throw new MissionValidationError('Mission bundle exportedAt is invalid')
  }
  const mission = migrateMissionRecord(record['mission'])
  const eventsRaw = record['events']
  if (!Array.isArray(eventsRaw))
    throw new MissionValidationError('Mission bundle events must be an array')
  if (eventsRaw.length > MAX_MISSION_IMPORT_EVENTS) {
    throw new MissionValidationError(
      `Mission bundle events must not exceed ${MAX_MISSION_IMPORT_EVENTS} entries`,
    )
  }

  const events: MissionEvent[] = eventsRaw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new MissionValidationError(`Mission event ${index} must be an object`)
    }
    const event = entry as Record<string, unknown>
    if (
      typeof event['eventId'] !== 'string' ||
      typeof event['missionId'] !== 'string' ||
      typeof event['type'] !== 'string' ||
      typeof event['timestamp'] !== 'string' ||
      typeof event['summary'] !== 'string'
    ) {
      throw new MissionValidationError(`Mission event ${index} is invalid`)
    }
    return {
      eventId: event['eventId'],
      missionId: event['missionId'],
      type: event['type'],
      timestamp: event['timestamp'],
      summary: event['summary'],
      ...(typeof event['payload'] === 'object' &&
      event['payload'] !== null &&
      !Array.isArray(event['payload'])
        ? { payload: event['payload'] as Record<string, unknown> }
        : {}),
    }
  })

  const warningsRaw = record['warnings']
  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw.filter((entry): entry is string => typeof entry === 'string').slice(0, 100)
    : []

  return redactMissionRecord(
    {
      kind: 'symbolwright.mission.bundle',
      schemaVersion: 1,
      exportedAt: record['exportedAt'],
      mission,
      events,
      warnings,
    },
    env,
  )
}
