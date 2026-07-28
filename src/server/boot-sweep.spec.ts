import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { runBootSweep } from './boot-sweep.js'
import { ReadinessRegistry } from './readiness-registry.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('runBootSweep', () => {
  it('does not materialize mission or retention index files in a pristine workspace', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-boot-sweep-'))
    roots.push(workspaceRoot)
    const missionService = new MissionService({ workspaceRoot, env: {} })
    const readiness = new ReadinessRegistry()

    const report = await runBootSweep({ workspaceRoot, missionService, readiness })

    expect(report.missionStoreHealthy).toBe(true)
    expect(report.retention).toEqual({ quarantined: 0, deleted: 0, restored: 0 })
    expect(existsSync(path.join(workspaceRoot, '.symbolwright', 'missions', 'index.json'))).toBe(
      false,
    )
    expect(existsSync(path.join(workspaceRoot, '.symbolwright', 'external-repos-quarantine'))).toBe(
      false,
    )
  })
})
