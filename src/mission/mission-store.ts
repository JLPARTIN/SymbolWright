import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { canAccessMission, type MissionVisibility } from '../access/mission-access-guard.js'
import { isValidMissionId } from './mission-id.js'
import { migrateMissionRecord } from './mission-migration.js'
import { redactMissionRecord } from './mission-redaction.js'
import type {
  SymbolWrightMission,
  MissionEvent,
  MissionListResult,
  MissionListSummary,
  MissionStoreWarning,
} from './mission-types.js'

interface MissionIndex {
  readonly schemaVersion: 1
  readonly missionIds: readonly string[]
  readonly updatedAt: string
}

export class MissionCorruptError extends Error {
  public constructor(
    message: string,
    public readonly missionId: string,
  ) {
    super(message)
  }
}

export interface MissionReadResult {
  readonly mission?: SymbolWrightMission
  readonly warnings: readonly MissionStoreWarning[]
}

export interface MissionStoreOptions {
  readonly workspaceRoot: string
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
}

function missionSummary(mission: SymbolWrightMission): MissionListSummary {
  const latestValidation = mission.evidence.validationRuns.at(-1)
  const latestPr = mission.references.pullRequestUrls.at(-1)
  return {
    id: mission.id,
    revision: mission.revision,
    name: mission.name,
    objective: mission.objective,
    status: mission.status,
    updatedAt: mission.updatedAt,
    lastOpenedAt: mission.lastOpenedAt,
    ...(mission.repository.repositoryName === undefined
      ? {}
      : { repositoryName: mission.repository.repositoryName }),
    repositoryRoot: mission.repository.rootPath,
    ...(mission.repository.branch === undefined ? {} : { branch: mission.repository.branch }),
    ...(latestValidation === undefined ? {} : { validationState: latestValidation.status }),
    changedFileCount: mission.repository.modifiedPaths.length,
    ...(latestPr === undefined ? {} : { pullRequestUrl: latestPr }),
    labels: mission.labels,
  }
}

function parseIndex(raw: unknown): MissionIndex {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Mission index must be an object')
  }
  const record = raw as Record<string, unknown>
  if (record['schemaVersion'] !== 1 || !Array.isArray(record['missionIds'])) {
    throw new Error('Mission index schema is invalid')
  }
  const missionIds = record['missionIds'].filter(
    (entry): entry is string => typeof entry === 'string' && isValidMissionId(entry),
  )
  return {
    schemaVersion: 1,
    missionIds: [...new Set(missionIds)],
    updatedAt:
      typeof record['updatedAt'] === 'string' ? record['updatedAt'] : new Date(0).toISOString(),
  }
}

export class MissionStore {
  private readonly workspaceRoot: string
  private readonly missionsRoot: string
  private readonly indexPath: string
  private readonly env: NodeJS.ProcessEnv
  private readonly now: () => Date

  public constructor(options: MissionStoreOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot)
    this.missionsRoot = path.join(this.workspaceRoot, '.symbolwright', 'missions')
    this.indexPath = path.join(this.missionsRoot, 'index.json')
    this.env = options.env ?? process.env
    this.now = options.now ?? (() => new Date())
    mkdirSync(this.missionsRoot, { recursive: true, mode: 0o700 })
  }

  public getRootPath(): string {
    return this.missionsRoot
  }

  public createMission(mission: SymbolWrightMission): void {
    const missionDir = this.resolveMissionDir(mission.id)
    if (existsSync(missionDir)) throw new Error(`Mission already exists: ${mission.id}`)
    mkdirSync(path.join(missionDir, 'artifacts'), { recursive: true, mode: 0o700 })
    this.writeMissionFiles(mission)
    this.atomicWriteText(this.eventsPath(mission.id), '')
    this.updateIndex((ids) => [...ids, mission.id])
  }

  public writeMission(mission: SymbolWrightMission): void {
    const missionDir = this.resolveMissionDir(mission.id)
    if (!existsSync(missionDir)) throw new Error(`Mission not found: ${mission.id}`)
    this.writeMissionFiles(mission)
    this.updateIndex((ids) => (ids.includes(mission.id) ? ids : [...ids, mission.id]))
  }

  public readMission(missionId: string): SymbolWrightMission | undefined {
    return this.readMissionResult(missionId).mission
  }

  public readMissionResult(missionId: string): MissionReadResult {
    const missionPath = this.missionPath(missionId)
    const warnings: MissionStoreWarning[] = []
    const recovered = this.recoverStaleTemporaryFile(missionPath)
    if (recovered) {
      warnings.push({
        code: 'STALE_TEMP_RECOVERED',
        missionId,
        path: missionPath,
        message: `Recovered mission ${missionId} from an interrupted atomic write.`,
      })
    }
    if (!existsSync(missionPath)) return { warnings }

    try {
      const mission = migrateMissionRecord(JSON.parse(readFileSync(missionPath, 'utf8')))
      return { mission, warnings }
    } catch (error) {
      const previousPath = `${missionPath}.previous`
      if (existsSync(previousPath)) {
        try {
          const mission = migrateMissionRecord(JSON.parse(readFileSync(previousPath, 'utf8')))
          warnings.push({
            code: 'CORRUPT_RECORD',
            missionId,
            path: missionPath,
            message: `Mission ${missionId} has a corrupt current record; the last valid previous record was loaded for recovery.`,
          })
          return { mission, warnings }
        } catch {
          // Preserve both files for forensic recovery and report the original failure below.
        }
      }

      warnings.push({
        code: 'CORRUPT_RECORD',
        missionId,
        path: missionPath,
        message: `Mission ${missionId} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      })
      return { warnings }
    }
  }

  /** `options.visibility`, when supplied, filters to missions the caller can see (direct
   * ownership plus per-mission team membership) *before* pagination/`total` are computed —
   * applied against the full record, not the projected `MissionListSummary`, since that summary
   * doesn't carry `grantId`. Omitted entirely for operator callers (unrestricted, unchanged). */
  public listMissions(
    options: {
      readonly offset?: number
      readonly limit?: number
      readonly visibility?: MissionVisibility
    } = {},
  ): MissionListResult {
    const offset = Math.max(0, Math.floor(options.offset ?? 0))
    const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)))
    const warnings: MissionStoreWarning[] = []
    const indexResult = this.readOrRecoverIndex()
    warnings.push(...indexResult.warnings)

    const summaries: MissionListSummary[] = []
    for (const missionId of indexResult.index.missionIds) {
      const readResult = this.readMissionResult(missionId)
      warnings.push(...readResult.warnings)
      if (readResult.mission === undefined) continue
      if (
        options.visibility !== undefined &&
        !canAccessMission(readResult.mission, options.visibility, 'read').allowed
      ) {
        continue
      }
      summaries.push(missionSummary(readResult.mission))
    }

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return {
      missions: summaries.slice(offset, offset + limit),
      warnings,
      total: summaries.length,
      offset,
      limit,
    }
  }

  /** Counts missions with `status: 'ACTIVE'` created by a given delegated-access grant, to
   * enforce `executionLimits.maxConcurrentMissions`. Reads full records (not the lighter
   * `listMissions` summary) since `grantId` isn't projected into `MissionListSummary`. */
  public countActiveMissionsForGrant(grantId: string): number {
    const indexResult = this.readOrRecoverIndex()
    let count = 0
    for (const missionId of indexResult.index.missionIds) {
      const mission = this.readMission(missionId)
      if (mission !== undefined && mission.status === 'ACTIVE' && mission.grantId === grantId) {
        count += 1
      }
    }
    return count
  }

  public appendEvent(event: MissionEvent): void {
    this.resolveMissionDir(event.missionId)
    const sanitized = redactMissionRecord(event, this.env)
    appendFileSync(this.eventsPath(event.missionId), `${JSON.stringify(sanitized)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  public readEvents(missionId: string): readonly MissionEvent[] {
    const eventsPath = this.eventsPath(missionId)
    if (!existsSync(eventsPath)) return []
    const events: MissionEvent[] = []
    for (const line of readFileSync(eventsPath, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const value = JSON.parse(line) as MissionEvent
        if (value.missionId === missionId && typeof value.eventId === 'string') events.push(value)
      } catch {
        // A torn final line or malformed event is skipped; prior append-only evidence remains readable.
      }
    }
    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  public deleteMission(missionId: string): void {
    const missionDir = this.resolveMissionDir(missionId)
    if (existsSync(missionDir)) rmSync(missionDir, { recursive: true, force: true })
    this.updateIndex((ids) => ids.filter((id) => id !== missionId))
  }

  private writeMissionFiles(mission: SymbolWrightMission): void {
    const sanitized = redactMissionRecord(mission, this.env)
    this.atomicWriteJson(this.missionPath(mission.id), sanitized)
    this.atomicWriteJson(path.join(this.resolveMissionDir(mission.id), 'conversation.json'), {
      schemaVersion: 1,
      missionId: sanitized.id,
      revision: sanitized.revision,
      agent: sanitized.agent,
    })
    this.atomicWriteJson(path.join(this.resolveMissionDir(mission.id), 'workspace.json'), {
      schemaVersion: 1,
      missionId: sanitized.id,
      revision: sanitized.revision,
      repository: sanitized.repository,
      workspace: sanitized.workspace,
      references: sanitized.references,
    })
  }

  private readOrRecoverIndex(): {
    readonly index: MissionIndex
    readonly warnings: readonly MissionStoreWarning[]
  } {
    const warnings: MissionStoreWarning[] = []
    this.recoverStaleTemporaryFile(this.indexPath)
    if (existsSync(this.indexPath)) {
      try {
        return { index: parseIndex(JSON.parse(readFileSync(this.indexPath, 'utf8'))), warnings }
      } catch {
        // Rebuild below without deleting the corrupt index; atomicWrite keeps a .previous copy.
      }
    }

    const missionIds = readdirSync(this.missionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isValidMissionId(entry.name))
      .map((entry) => entry.name)
    const index: MissionIndex = {
      schemaVersion: 1,
      missionIds,
      updatedAt: this.now().toISOString(),
    }
    this.atomicWriteJson(this.indexPath, index)
    warnings.push({
      code: 'INDEX_RECOVERED',
      path: this.indexPath,
      message: 'Mission index was missing or corrupt and was rebuilt from mission directories.',
    })
    return { index, warnings }
  }

  private updateIndex(mutator: (missionIds: readonly string[]) => readonly string[]): void {
    const current = this.readOrRecoverIndex().index
    const missionIds = [...new Set(mutator(current.missionIds))].filter(isValidMissionId)
    this.atomicWriteJson(this.indexPath, {
      schemaVersion: 1,
      missionIds,
      updatedAt: this.now().toISOString(),
    } satisfies MissionIndex)
  }

  private resolveMissionDir(missionId: string): string {
    if (!isValidMissionId(missionId)) throw new Error(`Invalid mission id: ${missionId}`)
    const resolved = path.resolve(this.missionsRoot, missionId)
    const prefix = `${this.missionsRoot}${path.sep}`
    if (!resolved.startsWith(prefix)) throw new Error('Mission path escaped the mission store')
    return resolved
  }

  private missionPath(missionId: string): string {
    return path.join(this.resolveMissionDir(missionId), 'mission.json')
  }

  private eventsPath(missionId: string): string {
    return path.join(this.resolveMissionDir(missionId), 'events.jsonl')
  }

  private atomicWriteJson(targetPath: string, value: unknown): void {
    this.atomicWriteText(targetPath, `${JSON.stringify(value, null, 2)}\n`)
  }

  private atomicWriteText(targetPath: string, content: string): void {
    mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 })
    const tempPath = `${targetPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
    const fd = openSync(tempPath, 'w', 0o600)
    try {
      writeFileSync(fd, content, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }

    if (existsSync(targetPath)) copyFileSync(targetPath, `${targetPath}.previous`)
    renameSync(tempPath, targetPath)
  }

  private recoverStaleTemporaryFile(targetPath: string): boolean {
    const directory = path.dirname(targetPath)
    if (!existsSync(directory)) return false
    const prefix = `${path.basename(targetPath)}.tmp-`
    const candidates = readdirSync(directory)
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => path.join(directory, entry))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

    if (candidates.length === 0) return false
    if (existsSync(targetPath)) {
      for (const candidate of candidates) unlinkSync(candidate)
      return false
    }

    for (const candidate of candidates) {
      try {
        JSON.parse(readFileSync(candidate, 'utf8'))
        renameSync(candidate, targetPath)
        for (const stale of candidates) {
          if (stale !== candidate && existsSync(stale)) unlinkSync(stale)
        }
        return true
      } catch {
        // Keep looking for the newest complete temporary record.
      }
    }
    return false
  }
}
