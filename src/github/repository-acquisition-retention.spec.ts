import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { performExternalRepositoryIntake } from './external-repository-intake.js'
import {
  finalizeQuarantine,
  pruneAcquisitionRoot,
  quarantineOrphanedWorkspaces,
} from './repository-acquisition-retention.js'
import { resolveAcquisitionRoot } from './repository-acquisition.js'
import type { GitHubRepositoryTarget } from './github-repository-target.js'

function target(overrides: Partial<GitHubRepositoryTarget> = {}): GitHubRepositoryTarget {
  return {
    host: 'github.com',
    owner: 'JLPARTIN',
    repo: 'sample-repo',
    targetType: 'repository',
    sourceUrl: 'https://github.com/JLPARTIN/sample-repo',
    canonicalHttpsUrl: 'https://github.com/JLPARTIN/sample-repo',
    ...overrides,
  }
}

describe('repository-acquisition-retention', () => {
  let workspaceRoot: string
  let missionService: MissionService
  let acquisitionRoot: string

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'symbolwright-retention-workspace-'))
    missionService = new MissionService({ workspaceRoot })
    acquisitionRoot = resolveAcquisitionRoot(workspaceRoot)
    mkdirSync(acquisitionRoot, { recursive: true })
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  function makeWorkspaceDir(name: string): string {
    const dir = join(acquisitionRoot, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'marker.txt'), 'x')
    return dir
  }

  async function createMissionAt(repositoryRoot: string) {
    const relative = repositoryRoot.slice(workspaceRoot.length + 1)
    return missionService.create({
      name: 'm',
      objective: 'o',
      workspaceKind: 'repository',
      repositoryPath: relative,
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
  }

  describe('quarantineOrphanedWorkspaces', () => {
    it('quarantines a workspace referenced by no mission at all', async () => {
      const orphan = makeWorkspaceDir('orphan')

      const result = await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      expect(result.quarantined).toHaveLength(1)
      expect(result.skippedReferenced).toBe(0)
      expect(existsSync(orphan)).toBe(false)
    })

    it('never quarantines a workspace referenced by an ACTIVE mission', async () => {
      const active = makeWorkspaceDir('active')
      await createMissionAt(active)

      const result = await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      expect(result.quarantined).toHaveLength(0)
      expect(result.skippedReferenced).toBe(1)
      expect(existsSync(active)).toBe(true)
    })

    it('never quarantines a workspace referenced by a non-ACTIVE (paused/abandoned) mission', async () => {
      const paused = makeWorkspaceDir('paused')
      const pausedMission = await createMissionAt(paused)
      missionService.pause(pausedMission.id, pausedMission.revision)

      const abandoned = makeWorkspaceDir('abandoned')
      const abandonedMission = await createMissionAt(abandoned)
      missionService.abandon(abandonedMission.id, abandonedMission.revision)

      const result = await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      expect(result.skippedReferenced).toBe(2)
      expect(existsSync(paused)).toBe(true)
      expect(existsSync(abandoned)).toBe(true)
    })

    it('quarantines a workspace once its owning mission is actually deleted', async () => {
      const dir = makeWorkspaceDir('to-delete')
      const mission = await createMissionAt(dir)
      missionService.delete(mission.id, mission.revision, true)

      const result = await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      expect(result.quarantined).toHaveLength(1)
      expect(existsSync(dir)).toBe(false)
    })

    it('records the original path in quarantine metadata', async () => {
      const orphan = makeWorkspaceDir('orphan-meta')

      const result = await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      const metaFiles = result.quarantined.map((entry) => `${entry}.meta.json`)
      const metadata = JSON.parse(readFileSync(metaFiles[0]!, 'utf8')) as { originalPath: string }
      expect(metadata.originalPath).toBe(orphan)
    })
  })

  describe('finalizeQuarantine', () => {
    it('leaves a freshly quarantined workspace alone while it is still within the grace window', async () => {
      makeWorkspaceDir('orphan')
      await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      const result = await finalizeQuarantine({ workspaceRoot, missionService })

      expect(result.deleted).toHaveLength(0)
      expect(result.stillWithinGrace).toBe(1)
    })

    it('deletes a quarantined workspace once its grace window has elapsed', async () => {
      makeWorkspaceDir('orphan')
      await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      const result = await finalizeQuarantine({
        workspaceRoot,
        missionService,
        policy: { quarantineGraceMs: 0 },
      })

      expect(result.deleted).toHaveLength(1)
      expect(result.restored).toHaveLength(0)
      expect(existsSync(result.deleted[0]!)).toBe(false)
    })

    it('restores a quarantined workspace if a mission started referencing its original path during the grace window', async () => {
      const dir = makeWorkspaceDir('recovered')
      const mission = await createMissionAt(dir)
      missionService.delete(mission.id, mission.revision, true)

      const quarantineResult = await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })
      expect(quarantineResult.quarantined).toHaveLength(1)
      expect(existsSync(dir)).toBe(false)

      // Simulate a new mission being created for the exact same path while the workspace sits in
      // quarantine -- the recheck immediately before deletion must catch this and restore it.
      mkdirSync(dir, { recursive: true })
      await createMissionAt(dir)

      const finalizeResult = await finalizeQuarantine({
        workspaceRoot,
        missionService,
        policy: { quarantineGraceMs: 0 },
      })

      expect(finalizeResult.restored).toEqual([dir])
      expect(finalizeResult.deleted).toHaveLength(0)
    })

    it('finalizes exactly one quarantined entry early once the quarantine count budget is exceeded, even within the grace window', async () => {
      makeWorkspaceDir('first')
      await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })
      makeWorkspaceDir('second')
      await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      const result = await finalizeQuarantine({
        workspaceRoot,
        missionService,
        policy: { maxQuarantineCount: 1 },
      })

      expect(result.deleted.length + result.restored.length).toBe(1)
      expect(result.stillWithinGrace).toBe(1)
    })

    it('finalizes entries early once the quarantine byte budget is exceeded', async () => {
      const big = makeWorkspaceDir('big')
      writeFileSync(join(big, 'payload.bin'), 'x'.repeat(10_000))
      await quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      const result = await finalizeQuarantine({
        workspaceRoot,
        missionService,
        policy: { quarantineGraceMs: 24 * 60 * 60 * 1000, maxQuarantineBytes: 100 },
      })

      expect(result.deleted.length + result.restored.length).toBe(1)
    })

    it('is a no-op when nothing has ever been quarantined', async () => {
      const result = await finalizeQuarantine({ workspaceRoot, missionService })
      expect(result).toEqual({ deleted: [], restored: [], stillWithinGrace: 0 })
    })
  })

  describe('pruneAcquisitionRoot', () => {
    it('runs both phases: quarantines newly-orphaned workspaces and finalizes what has aged out', async () => {
      makeWorkspaceDir('stale-orphan')
      const active = makeWorkspaceDir('still-active')
      await createMissionAt(active)

      const first = await pruneAcquisitionRoot({ workspaceRoot, missionService })
      expect(first.quarantined).toHaveLength(1)
      expect(first.deleted).toHaveLength(0)
      expect(first.stillWithinGrace).toBe(1)

      const second = await pruneAcquisitionRoot({
        workspaceRoot,
        missionService,
        policy: { quarantineGraceMs: 0 },
      })
      expect(second.deleted).toHaveLength(1)
      expect(existsSync(active)).toBe(true)
    })
  })

  describe('interaction with intake (acquisition-root lock)', () => {
    let sourceRepo: string

    beforeEach(async () => {
      sourceRepo = mkdtempSync(join(tmpdir(), 'symbolwright-retention-source-'))
      await runGitCommand(['init'], sourceRepo)
      await runGitCommand(['config', 'user.email', 'test@example.com'], sourceRepo)
      await runGitCommand(['config', 'user.name', 'Test'], sourceRepo)
      writeFileSync(join(sourceRepo, 'a.txt'), 'hello')
      await runGitCommand(['add', 'a.txt'], sourceRepo)
      await runGitCommand(['commit', '-m', 'initial'], sourceRepo)
    })

    afterEach(() => {
      rmSync(sourceRepo, { recursive: true, force: true })
    })

    it('never quarantines a workspace mid-acquisition: a concurrent prune sweep waits for intake to finish creating the mission', async () => {
      const intake = performExternalRepositoryIntake({
        target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
        workspaceRoot,
        missionService,
        mode: 'writable',
        objective: 'Fix the bug',
        runtimeMode: 'READ_ONLY',
      })
      const sweep = quarantineOrphanedWorkspaces({ workspaceRoot, missionService })

      const [intakeResult] = await Promise.all([intake, sweep])

      expect(intakeResult.mission).toBeDefined()
      expect(existsSync(intakeResult.acquisition.workspacePath)).toBe(true)
    })
  })
})
