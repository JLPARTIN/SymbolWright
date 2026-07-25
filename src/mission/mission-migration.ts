import { assertSymbolWrightMission, MissionValidationError } from './mission-validation.js'
import { CURRENT_MISSION_SCHEMA_VERSION, type SymbolWrightMission } from './mission-types.js'

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MissionValidationError('Mission record must be a JSON object')
  }
  return value as Record<string, unknown>
}

/**
 * Normalizes the initial schema. Keeping this as a named migration stage makes
 * version 1 the stable import floor and gives future schema versions an ordered
 * place to migrate without changing callers.
 */
function normalizeVersion1(raw: Record<string, unknown>): Record<string, unknown> {
  const repository = asRecord(raw['repository'])
  const agent = asRecord(raw['agent'])
  const workspace = asRecord(raw['workspace'])
  const evidence = asRecord(raw['evidence'])
  const references = asRecord(raw['references'])

  return {
    ...raw,
    schemaVersion: 1,
    revision:
      typeof raw['revision'] === 'number' && Number.isInteger(raw['revision'])
        ? raw['revision']
        : 1,
    repository: {
      modifiedPaths: [],
      ...repository,
    },
    agent: {
      messages: [],
      ...agent,
    },
    workspace: {
      openFiles: [],
      scratchAttached: false,
      ...workspace,
    },
    evidence: {
      toolCalls: [],
      validationRuns: [],
      webAccesses: [],
      mcpCalls: [],
      subagentRuns: [],
      skillRuns: [],
      ...evidence,
    },
    references: {
      checkpointIds: [],
      checkpointLinks: [],
      memoryEntryIds: [],
      memoryLinks: [],
      commitShas: [],
      pullRequestUrls: [],
      ...references,
    },
    labels: Array.isArray(raw['labels']) ? raw['labels'] : [],
  }
}

export function migrateMissionRecord(raw: unknown): SymbolWrightMission {
  const record = asRecord(raw)
  const schemaVersion = record['schemaVersion']
  if (schemaVersion !== 1) {
    throw new MissionValidationError(
      `Unsupported mission schema version: ${String(schemaVersion)}. Current version is ${CURRENT_MISSION_SCHEMA_VERSION}.`,
    )
  }

  const migrated = normalizeVersion1(record)
  assertSymbolWrightMission(migrated)
  return migrated
}
