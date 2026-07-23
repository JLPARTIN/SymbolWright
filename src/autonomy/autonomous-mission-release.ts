import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MissionDashboardProjection } from './mission-dashboard-projection.js'
import type { MissionAcceptancePacket } from './mission-acceptance-packet.js'
import type { MultiAgentDashboardProjection } from './multi-agent-dashboard-projection.js'

export type AutonomousMissionReleaseState =
  | 'merge-ready'
  | 'review-required'
  | 'blocked'
  | 'failed'
  | 'incomplete'

export type AutonomousMissionReleaseExecutionMode = 'start' | 'resume' | 'existing'

export interface AutonomousMissionReleaseRecord {
  readonly schemaVersion: 1
  readonly missionId: string
  readonly objective: string
  readonly state: AutonomousMissionReleaseState
  readonly nextAction:
    | 'merge'
    | 'review'
    | 'resolve-blocker'
    | 'inspect-diagnostics'
    | 'resume'
  readonly executionMode: AutonomousMissionReleaseExecutionMode
  readonly generatedAt: string
  readonly recovery: {
    readonly resumed: boolean
    readonly interruptedTaskIds: readonly string[]
  }
  readonly dashboard: MissionDashboardProjection
  readonly specialists?: MultiAgentDashboardProjection | undefined
  readonly acceptance: MissionAcceptancePacket
  readonly acceptancePacketPath: string
}

export interface AutonomousMissionReleaseStore {
  load(missionId: string): Promise<AutonomousMissionReleaseRecord | undefined>
  save(record: AutonomousMissionReleaseRecord): Promise<void>
}

export class JsonAutonomousMissionReleaseStore implements AutonomousMissionReleaseStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.codemind', 'autonomy', 'releases')
  }

  async load(missionId: string): Promise<AutonomousMissionReleaseRecord | undefined> {
    try {
      const raw = await readFile(path.join(this.#root, `${validateId(missionId)}.json`), 'utf8')
      return JSON.parse(raw) as AutonomousMissionReleaseRecord
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async save(record: AutonomousMissionReleaseRecord): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(record.missionId)}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid mission ID: ${value}`)
  return value
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
