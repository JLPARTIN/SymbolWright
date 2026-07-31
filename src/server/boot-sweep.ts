import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { resolveAcquisitionRoot } from '../github/repository-acquisition.js'
import {
  pruneAcquisitionRoot,
  resolveQuarantineRoot,
} from '../github/repository-acquisition-retention.js'
import type { MissionService } from '../mission/mission-service.js'
import { DependencyLayerBindingStore } from '../sandbox/dependency-layer-binding-store.js'
import { reconcileDependencyLayers } from '../sandbox/dependency-layer-reconciliation.js'
import { rotateEgressAuditLogIfNeeded } from '../sandbox/egress-audit-retention.js'
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
  readonly sandboxNetwork: {
    readonly brokenBindings: number
    readonly orphanedTempDirsRemoved: number
    readonly egressAuditRotated: boolean
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

  let sandboxHistoryHealthy = true
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
      sandboxHistoryHealthy = false
      warnings.push(
        `Sandbox history index is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  options.readiness.setCheck(
    'sandbox_history',
    sandboxHistoryHealthy,
    sandboxHistoryHealthy ? undefined : 'Sandbox history state is unreadable.',
  )

  let retentionHealthy = true
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
      retentionHealthy = false
      warnings.push(
        `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  options.readiness.setCheck(
    'repository_retention',
    retentionHealthy,
    retentionHealthy ? undefined : 'External repository retention sweep failed.',
  )

  let sandboxNetworkHealthy = true
  let sandboxNetwork = { brokenBindings: 0, orphanedTempDirsRemoved: 0, egressAuditRotated: false }
  const sandboxNetworkRoot = path.join(
    path.resolve(options.workspaceRoot),
    '.symbolwright',
    'sandbox-network',
  )
  if (existsSync(sandboxNetworkRoot)) {
    try {
      const bindingStore = new DependencyLayerBindingStore(
        path.join(sandboxNetworkRoot, 'dependency-bindings'),
      )
      const reconciliation = await reconcileDependencyLayers({
        stateRoot: path.join(sandboxNetworkRoot, 'dependency-layers'),
        bindingStore,
        ...(options.now === undefined ? {} : { now: options.now }),
      })
      const rotation = await rotateEgressAuditLogIfNeeded({
        filePath: path.join(sandboxNetworkRoot, 'egress', 'sandbox-egress-audit.jsonl'),
        ...(options.now === undefined ? {} : { now: options.now }),
      })
      const brokenBindings = reconciliation.bindings.filter((binding) => binding.status !== 'valid')
      sandboxNetwork = {
        brokenBindings: brokenBindings.length,
        orphanedTempDirsRemoved: reconciliation.orphanedTempDirsRemoved,
        egressAuditRotated: rotation.rotated,
      }
      for (const binding of brokenBindings) {
        warnings.push(
          `Boot sweep found a dependency layer binding in state "${binding.status}" (layer ${binding.layerId}, bound ${binding.boundAt}); it was not auto-repaired.`,
        )
      }
    } catch (error) {
      sandboxNetworkHealthy = false
      warnings.push(
        `Sandbox network reconciliation sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  options.readiness.setCheck(
    'sandbox_network_reconciliation',
    sandboxNetworkHealthy,
    sandboxNetworkHealthy ? undefined : 'Sandbox network reconciliation sweep failed.',
  )

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
  if (
    sandboxNetwork.orphanedTempDirsRemoved > 0 ||
    sandboxNetwork.egressAuditRotated ||
    sandboxNetwork.brokenBindings > 0
  ) {
    logger.info(
      `Boot sweep sandbox network: orphanedTempDirsRemoved=${sandboxNetwork.orphanedTempDirsRemoved}, egressAuditRotated=${sandboxNetwork.egressAuditRotated}, brokenBindings=${sandboxNetwork.brokenBindings}.`,
    )
  }

  return { missionStoreHealthy, staleActiveMissionIds, warnings, retention, sandboxNetwork }
}
