import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import {
  MissionRevisionConflictError,
  MissionService,
  MissionStateConflictError,
} from './mission-service.js'

const IDS = [
  'mission_11111111-1111-4111-8111-111111111111',
  'mission_22222222-2222-4222-8222-222222222222',
  'mission_33333333-3333-4333-8333-333333333333',
  'mission_44444444-4444-4444-8444-444444444444',
]

describe('MissionService', () => {
  let root: string
  let service: MissionService
  let idIndex: number

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-mission-service-'))
    await runGitCommand(['init'], root)
    await runGitCommand(['config', 'user.email', 'test@example.com'], root)
    await runGitCommand(['config', 'user.name', 'Test'], root)
    writeFileSync(join(root, 'a.txt'), 'hello')
    await runGitCommand(['add', 'a.txt'], root)
    await runGitCommand(['commit', '-m', 'initial'], root)
    idIndex = 0
    service = new MissionService({
      workspaceRoot: root,
      generateId: () => IDS[idIndex++]!,
      now: () => new Date('2026-07-20T12:00:00.000Z'),
    })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  async function create(options: { readonly grantId?: string } = {}) {
    return service.create(
      {
        name: 'Mission',
        objective: 'Persist state',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
        labels: [],
      },
      options,
    )
  }

  it('creates, pauses, resumes, completes, and explicitly reopens', async () => {
    const created = await create()
    const paused = service.pause(created.id, created.revision)
    expect(paused.status).toBe('PAUSED')
    const resumed = service.resume(paused.id, paused.revision)
    expect(resumed.status).toBe('ACTIVE')
    const completed = service.complete(resumed.id, resumed.revision)
    expect(completed.status).toBe('COMPLETED')
    const reopened = service.reopenCompleted(completed.id, completed.revision)
    expect(reopened.status).toBe('ACTIVE')
  })

  it('records the creating grantId when provided, and omits it when not', async () => {
    const withGrant = await create({ grantId: 'grant-1' })
    expect(withGrant.grantId).toBe('grant-1')

    const withoutGrant = await create()
    expect(withoutGrant.grantId).toBeUndefined()
  })

  it('counts only ACTIVE missions belonging to the given grant', async () => {
    const first = await create({ grantId: 'grant-1' })
    await create({ grantId: 'grant-1' })
    await create({ grantId: 'grant-2' })
    await create() // no grant at all (local operator)

    expect(service.countActiveMissionsForGrant('grant-1')).toBe(2)
    expect(service.countActiveMissionsForGrant('grant-2')).toBe(1)
    expect(service.countActiveMissionsForGrant('grant-3')).toBe(0)

    service.pause(first.id, first.revision)
    expect(service.countActiveMissionsForGrant('grant-1')).toBe(1)
  })

  it('detects optimistic revision conflicts', async () => {
    const created = await create()
    service.patch(created.id, { revision: created.revision, name: 'Changed' })
    expect(() => service.patch(created.id, { revision: created.revision, name: 'Stale' })).toThrow(
      MissionRevisionConflictError,
    )
  })

  it('requires explicit confirmation before deletion and leaves the repository intact', async () => {
    const created = await create()
    expect(() => service.delete(created.id, created.revision, false)).toThrow(
      MissionStateConflictError,
    )
    service.delete(created.id, created.revision, true)
    expect(service.list().missions).toHaveLength(0)
    expect(service.getStore().getRootPath()).toContain('.symbolwright/missions')
  })

  it('records conversation, files, evidence, commits, PRs, checkpoints, and memory references', async () => {
    const created = await create()
    service.recordAgentUserMessage(
      created.id,
      'Fix it',
      'APPROVED_EXECUTION',
      'anthropic',
      'claude-test',
    )
    service.recordToolStarted(created.id, 'tool-1', 'memory_store')
    service.recordToolCompleted(
      created.id,
      'tool-1',
      'memory_store',
      'Memory stored successfully with ID: mem-1',
      false,
      5,
    )
    service.recordAgentResult(
      created.id,
      [
        { role: 'user', content: 'Fix it' },
        { role: 'assistant', content: 'Done' },
      ],
      'Done',
      'completed',
    )
    service.recordFileOpened(created.id, 'a.txt', 'hash-1')
    service.recordFileSaved(created.id, 'a.txt', 'hash-2', {
      checkpointId: 'checkpoint-1',
      createdAt: '2026-07-20T12:00:00.000Z',
      paths: ['a.txt'],
      label: 'Before fix',
    })
    service.recordValidation(created.id, {
      id: 'validation-1',
      command: 'npm test',
      startedAt: '2026-07-20T12:00:00.000Z',
      completedAt: '2026-07-20T12:01:00.000Z',
      exitCode: 0,
      status: 'passed',
      summary: 'Tests passed',
    })
    service.recordCommit(created.id, 'abc123', 'Commit created')
    service.recordPullRequest(created.id, 'https://github.com/example/repo/pull/1')

    const reloaded = service.get(created.id)
    expect(reloaded.agent.messages).toHaveLength(2)
    expect(reloaded.workspace.activeFilePath).toBe('a.txt')
    expect(reloaded.references.checkpointIds).toContain('checkpoint-1')
    expect(reloaded.references.memoryEntryIds).toContain('mem-1')
    expect(reloaded.references.commitShas).toContain('abc123')
    expect(reloaded.references.pullRequestUrls).toHaveLength(1)
    expect(reloaded.evidence.validationRuns[0]?.status).toBe('passed')
  })

  it('exports and imports a paused copy with a new id', async () => {
    const created = await create()
    const bundle = service.export(created.id)
    const imported = service.import(bundle)
    expect(imported.id).not.toBe(created.id)
    expect(imported.status).toBe('PAUSED')
    expect(imported.importedFrom?.originalMissionId).toBe(created.id)
  })

  it('strips a foreign grantId from an imported bundle rather than inheriting it', async () => {
    // Regression test: `import()` used to spread `...bundle.mission` wholesale, so a mission
    // exported from a grant on one server -- or another grant on this one -- would carry that
    // stale `grantId` straight into the imported record, silently attributing ownership to a
    // grant id that only ever meant something in the original export's context.
    const created = await create()
    const bundle = service.export(created.id) as { mission: { grantId?: string } }
    bundle.mission.grantId = 'grant-from-another-server'

    const importedNoGrant = service.import(bundle)
    expect(importedNoGrant.grantId).toBeUndefined()

    const importedWithGrant = service.import(bundle, { grantId: 'grant-importing-caller' })
    expect(importedWithGrant.grantId).toBe('grant-importing-caller')
  })

  it('detects repository drift without switching branches', async () => {
    const created = await create()
    await runGitCommand(['checkout', '-b', 'other'], root)
    const reconciliation = await service.reconcileRepository(created.id)
    expect(reconciliation.hasDrift).toBe(true)
    expect(reconciliation.currentBranch).toBe('other')
    expect((await runGitCommand(['branch', '--show-current'], root)).stdout.trim()).toBe('other')
  })
})
