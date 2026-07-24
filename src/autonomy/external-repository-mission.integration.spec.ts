import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { performExternalRepositoryIntake } from '../github/external-repository-intake.js'
import { createGitHubOperationsPolicy } from '../github/github-operations-policy.js'
import type { GitHubRepositoryTarget } from '../github/github-repository-target.js'
import { preparePrOperationPacket } from '../github/pr-operation-packet.js'
import { MissionService } from '../mission/mission-service.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'

/**
 * Full Bundle #8 mission-runtime integration trial: acquire an
 * external-style repository (a real bare origin standing in for GitHub),
 * create a mission rooted at the acquired workspace via the unmodified
 * mission system, mutate a file the way a mission's editing phase would,
 * and generate a PR operation packet — all without ever pushing back to
 * the origin, proving the original is never touched unless explicitly
 * pushed (which this bundle never does automatically).
 */

function target(canonicalHttpsUrl: string): GitHubRepositoryTarget {
  return {
    host: 'github.com',
    owner: 'fixture-owner',
    repo: 'fixture-repo',
    targetType: 'repository',
    sourceUrl: canonicalHttpsUrl,
    canonicalHttpsUrl,
  }
}

async function createBareOriginWithNodeFixture(fixtureRoot: string): Promise<string> {
  const originPath = join(fixtureRoot, 'origin.git')
  const workingPath = join(fixtureRoot, 'working')
  mkdirSync(originPath, { recursive: true })
  mkdirSync(workingPath, { recursive: true })

  await runGitCommand(['init', '--bare'], originPath)
  await runGitCommand(['init'], workingPath)
  await runGitCommand(['config', 'user.email', 'fixture@example.com'], workingPath)
  await runGitCommand(['config', 'user.name', 'Fixture'], workingPath)
  await runGitCommand(['remote', 'add', 'origin', originPath], workingPath)

  writeFileSync(
    join(workingPath, 'package.json'),
    JSON.stringify({ name: 'fixture-node', scripts: { test: 'echo ok' } }),
  )
  writeFileSync(join(workingPath, 'index.js'), 'module.exports = 1;\n')
  await runGitCommand(['add', '.'], workingPath)
  await runGitCommand(['commit', '-m', 'fixture commit'], workingPath)
  await runGitCommand(['branch', '-m', 'main'], workingPath)
  await runGitCommand(['push', 'origin', 'main'], workingPath)
  await runGitCommand(['symbolic-ref', 'HEAD', 'refs/heads/main'], originPath)

  return originPath
}

describe('external repository mission integration — Bundle #8 full flow', () => {
  let fixtureRoot: string
  let workspaceRoot: string
  let missionService: MissionService

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'codemind-bundle8-mission-fixture-'))
    workspaceRoot = mkdtempSync(join(tmpdir(), 'codemind-bundle8-mission-workspace-'))
    missionService = new MissionService({ workspaceRoot })
  })

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('acquires an external repository, creates a mission, mutates a file, and prepares a PR packet without ever touching the origin', async () => {
    const originPath = await createBareOriginWithNodeFixture(fixtureRoot)
    const originRefsBefore = await runGitCommand(['show-ref'], originPath)

    const intake = await performExternalRepositoryIntake({
      target: target(`file://${originPath}`),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Add a new exported constant',
      runtimeMode: 'READ_ONLY',
    })

    expect(intake.acquisition.acquired).toBe(true)
    expect(intake.profile.portability?.ecosystems).toContain('node')
    expect(intake.mission).toBeDefined()
    const mission = intake.mission!
    expect(mission.repository.remoteUrl).toBe(`file://${originPath}`)
    expect(mission.repository.rootPath).toBe(intake.acquisition.workspacePath)

    // Simulate the mission's editing phase mutating a file in the acquired
    // workspace — this is exactly what the (unmodified) autonomous edit
    // executor would do; nothing about this bundle changes that path.
    writeFileSync(join(mission.repository.rootPath, 'index.js'), 'module.exports = 2;\n')

    const packet = await preparePrOperationPacket({
      repositoryRoot: mission.repository.rootPath,
      branchName: `codemind/${mission.id}`,
      baseBranch: mission.repository.branch ?? 'main',
      objective: mission.objective,
      changedFiles: [{ path: 'index.js', changeType: 'modified' }],
      validationEvidence: [{ command: 'npm test', status: 'passed', summary: 'All tests passed.' }],
      policy: createGitHubOperationsPolicy(),
    })

    expect(packet.branchCreated).toBe(true)
    expect(packet.commitCreated).toBe(true)
    expect(packet.readyToPush).toBe(true)
    expect(packet.writesAllowed).toBe(false)
    expect(packet.pullRequestCreationAllowed).toBe(false)
    expect(packet.prBody).toContain('index.js')

    // The mutation and the new local branch/commit are real, but the
    // original bare origin must be provably unchanged — nothing in this
    // flow pushes anywhere.
    const originRefsAfter = await runGitCommand(['show-ref'], originPath)
    expect(originRefsAfter.stdout).toBe(originRefsBefore.stdout)
  })

  it('records the acquisition and lets the operator inspect it via the same generic mission event timeline', async () => {
    const originPath = await createBareOriginWithNodeFixture(fixtureRoot)

    const intake = await performExternalRepositoryIntake({
      target: target(`file://${originPath}`),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Investigate a bug',
      runtimeMode: 'READ_ONLY',
    })

    const events = missionService.readEvents(intake.mission!.id)
    expect(events.some((event) => event.type === 'mission.created')).toBe(true)
    expect(events.some((event) => event.type === 'github.intake.acquired')).toBe(true)
  })

  it('never creates a mission or touches the origin when the intake mode is dry-run', async () => {
    const originPath = await createBareOriginWithNodeFixture(fixtureRoot)
    const originRefsBefore = await runGitCommand(['show-ref'], originPath)

    const intake = await performExternalRepositoryIntake({
      target: target(`file://${originPath}`),
      workspaceRoot,
      missionService,
      mode: 'dry-run',
      objective: 'Just look',
      runtimeMode: 'READ_ONLY',
    })

    expect(intake.mission).toBeUndefined()
    expect(missionService.list({ offset: 0, limit: 10 }).total).toBe(0)
    const originRefsAfter = await runGitCommand(['show-ref'], originPath)
    expect(originRefsAfter.stdout).toBe(originRefsBefore.stdout)
  })
})
