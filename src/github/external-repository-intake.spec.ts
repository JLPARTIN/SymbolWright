import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { resolveAcquisitionRoot } from './repository-acquisition.js'
import { performExternalRepositoryIntake } from './external-repository-intake.js'
import { createGitHubOperationsPolicy } from './github-operations-policy.js'
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

describe('performExternalRepositoryIntake', () => {
  let workspaceRoot: string
  let sourceRepo: string
  let missionService: MissionService

  beforeEach(async () => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'symbolwright-intake-workspace-'))
    sourceRepo = mkdtempSync(join(tmpdir(), 'symbolwright-intake-source-'))
    await runGitCommand(['init'], sourceRepo)
    await runGitCommand(['config', 'user.email', 'test@example.com'], sourceRepo)
    await runGitCommand(['config', 'user.name', 'Test'], sourceRepo)
    writeFileSync(
      join(sourceRepo, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }),
    )
    await runGitCommand(['add', 'package.json'], sourceRepo)
    await runGitCommand(['commit', '-m', 'initial'], sourceRepo)
    await runGitCommand(['branch', '-m', 'main'], sourceRepo)
    missionService = new MissionService({ workspaceRoot })
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
    rmSync(sourceRepo, { recursive: true, force: true })
  })

  it('acquires the repository and creates a real mission rooted at the acquired workspace', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
    })

    expect(result.acquisition.acquired).toBe(true)
    expect(result.profile.portability?.ecosystems).toContain('node')
    expect(result.mission).toBeDefined()
    expect(result.mission?.repository.rootPath).toBe(result.acquisition.workspacePath)
    expect(result.mission?.repository.remoteUrl).toBe(`file://${sourceRepo}`)
    expect(result.mission?.labels).toContain('external-repository')
    expect(result.mission?.labels).toContain('origin:github.com')
  })

  it('attributes the created mission to the caller-supplied grantId', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
      grantId: 'grant_intake-attribution-test',
    })
    expect(result.mission?.grantId).toBe('grant_intake-attribution-test')
  })

  it('records acquisition evidence as a mission event visible in the git/github filter bucket', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
    })
    const events = missionService.readEvents(result.mission!.id)
    const intakeEvent = events.find((event) => event.type === 'github.intake.acquired')
    expect(intakeEvent).toBeDefined()
    expect(intakeEvent?.payload?.['ecosystems']).toContain('node')
  })

  it('does not create a mission in dry-run mode', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'dry-run',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
    })
    expect(result.mission).toBeUndefined()
    expect(result.acquisition.acquired).toBe(false)
  })

  it('does not create a mission when acquisition fails', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: 'file:///nonexistent/does-not-exist' }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
    })
    expect(result.mission).toBeUndefined()
    expect(result.acquisition.acquired).toBe(false)
    expect(result.profile.riskFlags).toContain('acquisition-failed')
  })

  it('checks out a requested ref and reflects it in the created mission', async () => {
    await runGitCommand(['checkout', '-b', 'feature'], sourceRepo)
    writeFileSync(join(sourceRepo, 'feature.txt'), 'x')
    await runGitCommand(['add', 'feature.txt'], sourceRepo)
    await runGitCommand(['commit', '-m', 'feature commit'], sourceRepo)

    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      ref: 'feature',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
    })
    expect(result.mission?.repository.branch).toBe('feature')
  })

  it('parses a raw target string when no pre-parsed target is supplied', async () => {
    await expect(
      performExternalRepositoryIntake({
        rawTarget: 'not a valid target; rm -rf /',
        workspaceRoot,
        missionService,
        mode: 'dry-run',
        objective: 'x',
        runtimeMode: 'READ_ONLY',
      }),
    ).rejects.toThrow()
  })

  it('requires exactly one of target or rawTarget', async () => {
    await expect(
      performExternalRepositoryIntake({
        workspaceRoot,
        missionService,
        mode: 'dry-run',
        objective: 'x',
        runtimeMode: 'READ_ONLY',
      }),
    ).rejects.toThrow(/requires either/)
  })

  it('never creates a mission whose repository root escapes the workspace', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
    })
    expect(result.mission?.repository.rootPath.startsWith(workspaceRoot)).toBe(true)
  })

  it('cleans up the acquired workspace when mission creation fails', async () => {
    const acquisitionRoot = resolveAcquisitionRoot(workspaceRoot)
    vi.spyOn(missionService, 'create').mockRejectedValueOnce(new Error('boom'))

    await expect(
      performExternalRepositoryIntake({
        target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
        workspaceRoot,
        missionService,
        mode: 'writable',
        objective: 'Fix the bug',
        runtimeMode: 'READ_ONLY',
      }),
    ).rejects.toThrow('boom')

    expect(existsSync(acquisitionRoot) ? readdirSync(acquisitionRoot) : []).toHaveLength(0)
  })

  it('respects an explicitly enabled write policy when reporting profile flags on the created mission path', async () => {
    const result = await performExternalRepositoryIntake({
      target: target({ canonicalHttpsUrl: `file://${sourceRepo}` }),
      workspaceRoot,
      missionService,
      mode: 'writable',
      objective: 'Fix the bug',
      runtimeMode: 'READ_ONLY',
      policy: createGitHubOperationsPolicy({ enabledOperations: ['open_pull_request'] }),
    })
    expect(result.profile.pullRequestCreationAllowed).toBe(true)
    expect(result.profile.writesAllowed).toBe(false)
  })
})
