import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { resolveAcquisitionRoot } from '../github/repository-acquisition.js'
import {
  pruneAcquisitionRoot,
  resolveQuarantineRoot,
} from '../github/repository-acquisition-retention.js'
import type { MissionService } from '../mission/mission-service.js'
import type { ReadinessRegistry } from './readiness-registry.js'

export interface BootSweepLogger {
  warn(message: string): void
  info(message: string): void
}

export interface BootSweepOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly readiness: ReadinessRegistry
  readonly staleActiveAfterMs?: number
  readonly now?: () => Date
  readonly logger?: BootSweepLogger
}

export interface BootSweepReport {
  readonly missionStoreHealthy: boolean
  readonly staleActiveMissionIds: readonly string[]
  readonly warnings: readonly string[]
  readonly retention: {
    readonly quarantined: number
    readonly deleted: number
    readonly restored: number
  }
}

const DEFAULT_STALE_ACTIVE_AFTER_MS = 30 * 60 * 1000

export async function runBootSweep(options: BootSweepOptions): Promise<BootSweepReport> {
  const now = options.now ?? (() => new Date())
  const logger = options.logger ?? console
  const warnings: string[] = []
  const staleActiveMissionIds: string[] = []
  let missionStoreHealthy = true

  try {
    const missionsRoot = options.missionService.getStore().getRootPath()
    const missionIndexPath = path.join(missionsRoot, 'index.json')
    let hasMissionRecords = existsSync(missionIndexPath)
    if (!hasMissionRecords) {
      try {
        hasMissionRecords = readdirSync(missionsRoot).some((entry) => entry !== 'index.json')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }

    if (hasMissionRecords) {
      let offset = 0
      const pageSize = 200
      for (;;) {
        const page = options.missionService.list({ offset, limit: pageSize })
        if (page.warnings.some((warning) => warning.code === 'CORRUPT_RECORD')) {
          missionStoreHealthy = false
        }
        for (const warning of page.warnings) warnings.push(warning.message)
        for (const mission of page.missions) {
          if (
            mission.status === 'ACTIVE' &&
            now().getTime() - new Date(mission.updatedAt).getTime() >=
              (options.staleActiveAfterMs ?? DEFAULT_STALE_ACTIVE_AFTER_MS)
          ) {
            staleActiveMissionIds.push(mission.id)
          }
        }
        offset += page.missions.length
        if (page.missions.length === 0 || offset >= page.total) break
      }
    }
  } catch (error) {
    missionStoreHealthy = false
    warnings.push(
      `Mission-store boot sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const sandboxIndex = path.join(
    path.resolve(options.workspaceRoot),
    '.symbolwright',
    'sandbox',
    'index.json',
  )
  if (existsSync(sandboxIndex)) {
    try {
      JSON.parse(readFileSync(sandboxIndex, 'utf8'))
    } catch (error) {
      warnings.push(
        `Sandbox history index is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  let retention = { quarantined: 0, deleted: 0, restored: 0 }
  const acquisitionRoot = resolveAcquisitionRoot(options.workspaceRoot)
  const quarantineRoot = resolveQuarantineRoot(options.workspaceRoot)
  if (existsSync(acquisitionRoot) || existsSync(quarantineRoot)) {
    try {
      const result = await pruneAcquisitionRoot({
        workspaceRoot: options.workspaceRoot,
        missionService: options.missionService,
      })
      retention = {
        quarantined: result.quarantined.length,
        deleted: result.deleted.length,
        restored: result.restored.length,
      }
    } catch (error) {
      warnings.push(
        `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  options.readiness.setCheck(
    'mission_store',
    missionStoreHealthy,
    missionStoreHealthy ? undefined : 'One or more mission records are unreadable.',
  )
  options.readiness.setCheck('boot_sweep', true)

  for (const missionId of staleActiveMissionIds) {
    logger.warn(
      `Boot sweep detected stale ACTIVE mission ${missionId}; it was not auto-resumed or mutated.`,
    )
  }
  for (const warning of warnings) logger.warn(warning)
  if (retention.quarantined + retention.deleted + retention.restored > 0) {
    logger.info(
      `Boot sweep retention: quarantined=${retention.quarantined}, deleted=${retention.deleted}, restored=${retention.restored}.`,
    )
  }

  return { missionStoreHealthy, staleActiveMissionIds, warnings, retention }
}
