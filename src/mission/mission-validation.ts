import { isCodemindRuntimeMode } from '../runtime/policy/runtime-policy.js'
import type { CodemindRuntimeMode } from '../runtime/types.js'
import { isValidMissionId } from './mission-id.js'
import {
  CURRENT_MISSION_SCHEMA_VERSION,
  MISSION_STATUSES,
  type CodeMindMission,
  type MissionStatus,
} from './mission-types.js'

const MAX_NAME_CHARS = 200
const MAX_OBJECTIVE_CHARS = 32_000
const MAX_NOTES_CHARS = 64_000
const MAX_LABELS = 50
const MAX_LABEL_CHARS = 80

export class MissionValidationError extends Error {}

export interface CreateMissionInput {
  readonly name: string
  readonly objective: string
  readonly workspaceKind: 'repository' | 'scratch'
  readonly repositoryPath: string
  readonly runtimeMode: CodemindRuntimeMode
  readonly activeProviderId?: string
  readonly model?: string
  readonly labels: readonly string[]
  readonly notes?: string
}

export interface PatchMissionInput {
  readonly revision: number
  readonly name?: string
  readonly objective?: string
  readonly runtimeMode?: CodemindRuntimeMode
  readonly activeProviderId?: string | null
  readonly model?: string | null
  readonly workspaceKind?: 'repository' | 'scratch'
  readonly activeFilePath?: string | null
  readonly selectedDiffPath?: string | null
  readonly labels?: readonly string[]
  readonly notes?: string | null
  readonly repository?: {
    readonly rootPath?: string
    readonly repositoryName?: string | null
    readonly remoteUrl?: string | null
    readonly branch?: string | null
    readonly baseSha?: string | null
    readonly headSha?: string | null
    readonly modifiedPaths?: readonly string[]
  }
}

function asRecord(value: unknown, message = 'Expected a JSON object'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MissionValidationError(message)
  }
  return value as Record<string, unknown>
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
  maxChars: number,
): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MissionValidationError(`${field} must be a non-empty string`)
  }
  if (value.length > maxChars) {
    throw new MissionValidationError(`${field} must not exceed ${maxChars} characters`)
  }
  return value.trim()
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  maxChars: number,
): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new MissionValidationError(`${field} must be a string`)
  if (value.length > maxChars) {
    throw new MissionValidationError(`${field} must not exceed ${maxChars} characters`)
  }
  return value.trim()
}

function nullableString(
  record: Record<string, unknown>,
  field: string,
  maxChars: number,
): string | null | undefined {
  const value = record[field]
  if (value === undefined || value === null) return value
  if (typeof value !== 'string') throw new MissionValidationError(`${field} must be a string or null`)
  if (value.length > maxChars) {
    throw new MissionValidationError(`${field} must not exceed ${maxChars} characters`)
  }
  return value.trim()
}

function parseLabels(value: unknown): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new MissionValidationError('labels must be an array')
  if (value.length > MAX_LABELS) {
    throw new MissionValidationError(`labels must not exceed ${MAX_LABELS} entries`)
  }
  const labels = value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new MissionValidationError('labels must contain non-empty strings')
    }
    if (entry.length > MAX_LABEL_CHARS) {
      throw new MissionValidationError(`labels must not exceed ${MAX_LABEL_CHARS} characters each`)
    }
    return entry.trim()
  })
  return [...new Set(labels)]
}

function parseStringArray(value: unknown, field: string, maxEntries = 5_000): readonly string[] {
  if (!Array.isArray(value)) throw new MissionValidationError(`${field} must be an array`)
  if (value.length > maxEntries) {
    throw new MissionValidationError(`${field} must not exceed ${maxEntries} entries`)
  }
  return value.map((entry) => {
    if (typeof entry !== 'string') throw new MissionValidationError(`${field} must contain strings`)
    return entry
  })
}

export function parseCreateMissionInput(raw: unknown): CreateMissionInput {
  const record = asRecord(raw, 'Mission create body must be a JSON object')
  const workspaceKind = record['workspaceKind']
  if (workspaceKind !== 'repository' && workspaceKind !== 'scratch') {
    throw new MissionValidationError('workspaceKind must be repository or scratch')
  }

  const runtimeModeRaw = record['runtimeMode'] ?? 'READ_ONLY'
  if (typeof runtimeModeRaw !== 'string' || !isCodemindRuntimeMode(runtimeModeRaw)) {
    throw new MissionValidationError('runtimeMode is invalid')
  }

  const repositoryPath = requiredString(record, 'repositoryPath', 4_096)
  const activeProviderId = optionalString(record, 'activeProviderId', 200)
  const model = optionalString(record, 'model', 500)
  const notes = optionalString(record, 'notes', MAX_NOTES_CHARS)

  return {
    name: requiredString(record, 'name', MAX_NAME_CHARS),
    objective: requiredString(record, 'objective', MAX_OBJECTIVE_CHARS),
    workspaceKind,
    repositoryPath,
    runtimeMode: runtimeModeRaw,
    ...(activeProviderId === undefined ? {} : { activeProviderId }),
    ...(model === undefined ? {} : { model }),
    labels: parseLabels(record['labels']),
    ...(notes === undefined ? {} : { notes }),
  }
}

export function parsePatchMissionInput(raw: unknown): PatchMissionInput {
  const record = asRecord(raw, 'Mission patch body must be a JSON object')
  const revision = record['revision']
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    throw new MissionValidationError('revision must be a positive integer')
  }

  const runtimeModeRaw = record['runtimeMode']
  if (
    runtimeModeRaw !== undefined &&
    (typeof runtimeModeRaw !== 'string' || !isCodemindRuntimeMode(runtimeModeRaw))
  ) {
    throw new MissionValidationError('runtimeMode is invalid')
  }

  const workspaceKind = record['workspaceKind']
  if (
    workspaceKind !== undefined &&
    workspaceKind !== 'repository' &&
    workspaceKind !== 'scratch'
  ) {
    throw new MissionValidationError('workspaceKind must be repository or scratch')
  }

  const repositoryRaw = record['repository']
  let repository: PatchMissionInput['repository']
  if (repositoryRaw !== undefined) {
    const repositoryRecord = asRecord(repositoryRaw, 'repository must be an object')
    const rootPath = optionalString(repositoryRecord, 'rootPath', 4_096)
    const repositoryName = nullableString(repositoryRecord, 'repositoryName', 500)
    const remoteUrl = nullableString(repositoryRecord, 'remoteUrl', 4_096)
    const branch = nullableString(repositoryRecord, 'branch', 500)
    const baseSha = nullableString(repositoryRecord, 'baseSha', 200)
    const headSha = nullableString(repositoryRecord, 'headSha', 200)
    const modifiedPaths =
      repositoryRecord['modifiedPaths'] === undefined
        ? undefined
        : parseStringArray(repositoryRecord['modifiedPaths'], 'repository.modifiedPaths')
    repository = {
      ...(rootPath === undefined ? {} : { rootPath }),
      ...(repositoryName === undefined ? {} : { repositoryName }),
      ...(remoteUrl === undefined ? {} : { remoteUrl }),
      ...(branch === undefined ? {} : { branch }),
      ...(baseSha === undefined ? {} : { baseSha }),
      ...(headSha === undefined ? {} : { headSha }),
      ...(modifiedPaths === undefined ? {} : { modifiedPaths }),
    }
  }

  const name = optionalString(record, 'name', MAX_NAME_CHARS)
  const objective = optionalString(record, 'objective', MAX_OBJECTIVE_CHARS)
  const activeProviderId = nullableString(record, 'activeProviderId', 200)
  const model = nullableString(record, 'model', 500)
  const activeFilePath = nullableString(record, 'activeFilePath', 4_096)
  const selectedDiffPath = nullableString(record, 'selectedDiffPath', 4_096)
  const notes = nullableString(record, 'notes', MAX_NOTES_CHARS)

  return {
    revision,
    ...(name === undefined ? {} : { name }),
    ...(objective === undefined ? {} : { objective }),
    ...(runtimeModeRaw === undefined ? {} : { runtimeMode: runtimeModeRaw }),
    ...(activeProviderId === undefined ? {} : { activeProviderId }),
    ...(model === undefined ? {} : { model }),
    ...(workspaceKind === undefined ? {} : { workspaceKind }),
    ...(activeFilePath === undefined ? {} : { activeFilePath }),
    ...(selectedDiffPath === undefined ? {} : { selectedDiffPath }),
    ...(record['labels'] === undefined ? {} : { labels: parseLabels(record['labels']) }),
    ...(notes === undefined ? {} : { notes }),
    ...(repository === undefined ? {} : { repository }),
  }
}

export function isMissionStatus(value: unknown): value is MissionStatus {
  return typeof value === 'string' && (MISSION_STATUSES as readonly string[]).includes(value)
}

export function assertCodeMindMission(value: unknown): asserts value is CodeMindMission {
  const record = asRecord(value, 'Mission record must be an object')
  if (record['schemaVersion'] !== CURRENT_MISSION_SCHEMA_VERSION) {
    throw new MissionValidationError(`Unsupported mission schema version: ${String(record['schemaVersion'])}`)
  }
  if (typeof record['id'] !== 'string' || !isValidMissionId(record['id'])) {
    throw new MissionValidationError('Mission record has an invalid id')
  }
  if (typeof record['revision'] !== 'number' || !Number.isInteger(record['revision'])) {
    throw new MissionValidationError('Mission record has an invalid revision')
  }
  requiredString(record, 'name', MAX_NAME_CHARS)
  requiredString(record, 'objective', MAX_OBJECTIVE_CHARS)
  if (!isMissionStatus(record['status'])) {
    throw new MissionValidationError('Mission record has an invalid status')
  }
  for (const field of ['createdAt', 'updatedAt', 'lastOpenedAt']) {
    if (typeof record[field] !== 'string' || Number.isNaN(Date.parse(record[field] as string))) {
      throw new MissionValidationError(`Mission record has an invalid ${field}`)
    }
  }
  asRecord(record['repository'], 'Mission repository must be an object')
  asRecord(record['agent'], 'Mission agent must be an object')
  asRecord(record['workspace'], 'Mission workspace must be an object')
  asRecord(record['evidence'], 'Mission evidence must be an object')
  asRecord(record['references'], 'Mission references must be an object')
  parseLabels(record['labels'])
}
