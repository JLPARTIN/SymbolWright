import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import {
  createMissionEvent,
  eventMatchesFilter,
  paginateMissionEvents,
  recoverInterruptedMissionEvents,
  type MissionEventFilter,
} from './mission-events.js'
import {
  createMissionExportBundle,
  parseMissionExportBundle,
  serializeMissionExportBundle,
} from './mission-export.js'
import { migrateMissionRecord } from './mission-migration.js'
import {
  containsRepresentativeSecret,
  redactMissionRecord,
  redactMissionText,
  sanitizeMissionPayload,
} from './mission-redaction.js'
import {
  MissionRevisionConflictError,
  MissionService,
  MissionStateConflictError,
} from './mission-service.js'
import type { CodeMindMission, MissionEvent } from './mission-types.js'
import {
  assertCodeMindMission,
  isMissionStatus,
  MissionValidationError,
  parseCreateMissionInput,
  parsePatchMissionInput,
} from './mission-validation.js'

const IDS = [
  'mission_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'mission_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'mission_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'mission_dddddddd-dddd-4ddd-8ddd-dddddddddddd',
]

function expectValidationError(fn: () => unknown): void {
  expect(fn).toThrow(MissionValidationError)
}

describe('mission branch coverage contracts', () => {
  let workspace: string
  let repo: string
  let service: MissionService
  let idIndex: number

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'codemind-mission-coverage-'))
    repo = join(workspace, 'repo')
    mkdirSync(repo)
    await runGitCommand(['init'], repo)
    await runGitCommand(['config', 'user.email', 'test@example.com'], repo)
    await runGitCommand(['config', 'user.name', 'Test User'], repo)
    await runGitCommand(['remote', 'add', 'origin', 'git@github.com:JLPARTIN/CodeMind.git'], repo)
    writeFileSync(join(repo, 'tracked.txt'), 'hello')
    await runGitCommand(['add', 'tracked.txt'], repo)
    await runGitCommand(['commit', '-m', 'initial'], repo)
    idIndex = 0
    service = new MissionService({
      workspaceRoot: workspace,
      env: {
        CODEMIND_API_KEY: 'local-codemind-secret',
        GITHUB_TOKEN: 'ghp_123456789012345678901234567890123456',
      },
      generateId: () => IDS[idIndex++]!,
      now: () => new Date('2026-07-20T12:00:00.000Z'),
    })
  })

  afterEach(() => rmSync(workspace, { recursive: true, force: true }))

  async function createMission(): Promise<CodeMindMission> {
    return service.create({
      name: 'Coverage mission',
      objective: 'Exercise mission branches without fake behavior.',
      workspaceKind: 'repository',
      repositoryPath: 'repo',
      runtimeMode: 'READ_ONLY',
      activeProviderId: 'anthropic',
      model: 'claude-test',
      labels: ['bundle-3', 'bundle-3', 'coverage'],
      notes: 'initial notes',
    })
  }

  it('exercises mission lifecycle, patch, repository, evidence, and reference branches', async () => {
    const created = await createMission()
    expect(created.repository.repositoryName).toBe('JLPARTIN/CodeMind')
    expect(created.agent.activeProviderId).toBe('anthropic')
    expect(created.labels).toEqual(['bundle-3', 'coverage'])

    const patched = service.patch(created.id, {
      revision: created.revision,
      name: 'Renamed mission',
      objective: 'Updated objective',
      runtimeMode: 'APPROVED_EXECUTION',
      activeProviderId: 'openai',
      model: 'gpt-test',
      workspaceKind: 'repository',
      activeFilePath: 'tracked.txt',
      selectedDiffPath: 'tracked.txt',
      labels: ['ci', 'ci', 'resume'],
      notes: 'updated notes',
      repository: {
        rootPath: 'repo',
        repositoryName: 'JLPARTIN/CodeMind',
        remoteUrl: 'https://github.com/JLPARTIN/CodeMind.git',
        branch: 'feature/mission',
        baseSha: 'base-sha',
        headSha: 'head-sha',
        modifiedPaths: ['tracked.txt', 'tracked.txt', '.codemind/internal.json'],
      },
    })
    expect(patched.revision).toBe(created.revision + 1)
    expect(patched.agent.runtimeMode).toBe('APPROVED_EXECUTION')
    expect(patched.workspace.selectedDiffPath).toBe('tracked.txt')
    expect(patched.repository.modifiedPaths).toEqual(['tracked.txt', '.codemind/internal.json'])

    const cleared = service.patch(patched.id, {
      revision: patched.revision,
      activeProviderId: null,
      model: null,
      activeFilePath: null,
      selectedDiffPath: null,
      notes: null,
      repository: {
        repositoryName: null,
        remoteUrl: null,
        branch: null,
        baseSha: null,
        headSha: null,
      },
    })
    expect(cleared.agent.activeProviderId).toBeUndefined()
    expect(cleared.agent.model).toBeUndefined()
    expect(cleared.workspace.activeFilePath).toBeUndefined()
    expect(cleared.notes).toBeUndefined()

    service.recordAgentUserMessage(created.id, 'Use Bearer abcdefghijklmnop safely', 'READ_ONLY', 'google')
    service.recordAgentResult(created.id, undefined, 'Assistant text', 'ok')
    service.recordAgentResult(created.id, undefined, 'Failure text', 'error')
    service.recordToolStarted(created.id, 'tool-1', 'memory_recall')
    service.recordToolCompleted(
      created.id,
      'tool-1',
      'memory_recall',
      'Found [EPISODIC:mem-one] and [GRAPH:mem-two]',
      true,
      42,
    )
    service.recordFileOpened(created.id, 'tracked.txt')
    service.recordFileSaved(created.id, 'tracked.txt', 'hash-after-save')
    service.recordFileConflict(created.id, 'tracked.txt')
    service.recordDiffViewed(created.id, 'tracked.txt')
    service.recordBranchChanged(created.id, 'feature/mission', 'branch-head')
    service.recordPush(created.id, 'feature/mission', 'origin')
    service.attachCheckpoint(created.id, {
      checkpointId: 'checkpoint-one',
      createdAt: '2026-07-20T12:00:00.000Z',
      paths: ['tracked.txt'],
      triggeringToolCallId: 'tool-1',
    })
    service.labelCheckpoint(created.id, 'checkpoint-one', 'After CI fix')
    service.recordCheckpointRestored(created.id, 'checkpoint-one')
    for (const status of ['running', 'failed', 'blocked'] as const) {
      service.recordValidation(created.id, {
        id: `validation-${status}`,
        command: `npm run ${status}`,
        startedAt: '2026-07-20T12:00:00.000Z',
        status,
        summary: `Validation ${status}`,
        ...(status === 'failed' ? { outputExcerpt: 'failed output' } : {}),
      })
    }
    service.recordCommit(created.id, 'commit-sha', 'Commit created')
    service.recordPullRequest(created.id, 'https://github.com/JLPARTIN/CodeMind/pull/237')

    const scratch = service.attachScratchWorkspace(created.id, service.get(created.id).revision, {
      files: [{ path: 'scratch.ts', content: 'const x = 1' }],
    })
    expect(scratch.workspace.kind).toBe('scratch')
    expect(scratch.workspace.scratchAttached).toBe(true)

    const updated = service.get(created.id)
    expect(JSON.stringify(updated)).not.toContain('abcdefghijklmnop')
    expect(updated.references.memoryEntryIds).toEqual(['mem-one', 'mem-two'])
    expect(updated.references.checkpointLinks[0]?.label).toBe('After CI fix')
    expect(updated.evidence.toolCalls[0]?.status).toBe('failed')
    expect(updated.evidence.validationRuns.map((entry) => entry.status)).toEqual([
      'running',
      'failed',
      'blocked',
    ])
  })

  it('covers state conflicts, missing repositories, deleted branches, and import id replacement', async () => {
    const mission = await createMission()
    expect(() => service.resume(mission.id, mission.revision)).toThrow(MissionStateConflictError)
    expect(() => service.reopenCompleted(mission.id, mission.revision)).toThrow(
      MissionStateConflictError,
    )

    const completed = service.complete(mission.id, mission.revision)
    expect(() => service.abandon(mission.id, completed.revision)).toThrow(MissionStateConflictError)
    expect(() =>
      service.patch(mission.id, { revision: completed.revision - 1, name: 'stale' }),
    ).toThrow(MissionRevisionConflictError)

    const branchMission = await createMission()
    const originalBranch = (await runGitCommand(['branch', '--show-current'], repo)).stdout.trim()
    await runGitCommand(['checkout', '-b', 'temporary-mission-branch'], repo)
    service.recordBranchChanged(branchMission.id, 'temporary-mission-branch')
    await runGitCommand(['checkout', originalBranch], repo)
    await runGitCommand(['branch', '-D', 'temporary-mission-branch'], repo)
    const deletedBranch = await service.reconcileRepository(branchMission.id)
    expect(deletedBranch.repositoryAvailable).toBe(true)
    expect(deletedBranch.branchExists).toBe(false)
    expect(deletedBranch.hasDrift).toBe(true)

    rmSync(repo, { recursive: true, force: true })
    const missingRepository = await service.reconcileRepository(branchMission.id)
    expect(missingRepository.repositoryAvailable).toBe(false)
    expect(missingRepository.warnings.join('\n')).toContain('Repository path is unavailable')

    const imported = service.import(service.export(branchMission.id))
    expect(imported.id).not.toBe(branchMission.id)
    expect(imported.status).toBe('PAUSED')
  })

  it('covers export, import, migration, validation, and redaction edge cases', async () => {
    const mission = await createMission()
    const event = createMissionEvent({
      missionId: mission.id,
      eventId: 'event-one',
      type: 'web.request.completed',
      timestamp: '2026-07-20T12:00:00.000Z',
      summary: 'Web completed',
      payload: { url: 'https://example.test/?token=secret-token-value' },
    })
    const bundle = createMissionExportBundle(
      mission,
      [event],
      { exportedAt: '2026-07-20T12:00:00.000Z', warnings: ['custom warning'] },
      { SECRET_TOKEN: 'secret-token-value' },
    )
    const serialized = serializeMissionExportBundle(bundle)
    expect(parseMissionExportBundle(serialized).events[0]?.payload?.['url']).toContain('[REDACTED]')
    expect(parseMissionExportBundle({ ...bundle, warnings: [1, 'kept', true] }).warnings).toEqual([
      'kept',
    ])

    for (const raw of [
      'not-json',
      [],
      { kind: 'wrong', schemaVersion: 1 },
      { ...bundle, exportedAt: 'not-a-date' },
      { ...bundle, events: 'not-events' },
      { ...bundle, events: [null] },
      { ...bundle, events: [{ eventId: 123 }] },
    ]) {
      expectValidationError(() => parseMissionExportBundle(raw))
    }

    const rawMission = JSON.parse(JSON.stringify(mission)) as Record<string, unknown>
    rawMission['revision'] = 'not-a-number'
    rawMission['agent'] = { runtimeMode: 'READ_ONLY' }
    rawMission['workspace'] = { kind: 'repository' }
    rawMission['evidence'] = {}
    rawMission['references'] = {}
    rawMission['labels'] = 'not-labels'
    const migrated = migrateMissionRecord(rawMission)
    expect(migrated.revision).toBe(1)
    expect(migrated.workspace.openFiles).toEqual([])
    expectValidationError(() => migrateMissionRecord(null))
    expectValidationError(() => migrateMissionRecord({ ...rawMission, schemaVersion: 999 }))

    expect(
      parseCreateMissionInput({
        name: 'Scratch mission',
        objective: 'Use default runtime mode',
        workspaceKind: 'scratch',
        repositoryPath: 'repo',
        labels: ['a', 'a'],
        activeProviderId: 'anthropic',
        model: 'claude-test',
        notes: 'notes',
      }).runtimeMode,
    ).toBe('READ_ONLY')
    expect(
      parsePatchMissionInput({
        revision: 1,
        runtimeMode: 'PROPOSAL_ONLY',
        workspaceKind: 'scratch',
        activeProviderId: null,
        model: null,
        activeFilePath: null,
        selectedDiffPath: null,
        notes: null,
        labels: ['x'],
        repository: { modifiedPaths: ['a.ts'] },
      }).repository?.modifiedPaths,
    ).toEqual(['a.ts'])

    for (const raw of [
      null,
      { name: '', objective: 'x', workspaceKind: 'repository', repositoryPath: 'repo' },
      { name: 'x', objective: '', workspaceKind: 'repository', repositoryPath: 'repo' },
      { name: 'x', objective: 'y', workspaceKind: 'wrong', repositoryPath: 'repo' },
      {
        name: 'x',
        objective: 'y',
        workspaceKind: 'repository',
        repositoryPath: 'repo',
        runtimeMode: 'BAD',
      },
      { name: 'x', objective: 'y', workspaceKind: 'repository', repositoryPath: 'repo', labels: 'bad' },
      { name: 'x', objective: 'y', workspaceKind: 'repository', repositoryPath: 'repo', labels: [''] },
    ]) {
      expectValidationError(() => parseCreateMissionInput(raw))
    }

    for (const raw of [
      null,
      { revision: 0 },
      { revision: 1, runtimeMode: 'BAD' },
      { revision: 1, workspaceKind: 'wrong' },
      { revision: 1, repository: 'bad' },
      { revision: 1, repository: { modifiedPaths: 'bad' } },
    ]) {
      expectValidationError(() => parsePatchMissionInput(raw))
    }

    expect(isMissionStatus('FAILED')).toBe(true)
    expect(isMissionStatus('DONE')).toBe(false)
    expect(() => assertCodeMindMission({ ...mission, status: 'BAD' })).toThrow(MissionValidationError)
    expect(() => assertCodeMindMission({ ...mission, createdAt: 'not-a-date' })).toThrow(
      MissionValidationError,
    )
  })

  it('covers mission event filters, pagination defaults, interruption terminal branches, and redaction shapes', () => {
    const missionId = IDS[0]!
    const events: readonly MissionEvent[] = [
      createMissionEvent({ missionId, type: 'agent.message.user', summary: 'agent' }),
      createMissionEvent({ missionId, type: 'workspace.file.opened', summary: 'file' }),
      createMissionEvent({ missionId, type: 'workspace.diff.viewed', summary: 'diff' }),
      createMissionEvent({
        missionId,
        type: 'agent.tool.started',
        summary: 'tool',
        payload: { toolCallId: 'tool-a' },
      }),
      createMissionEvent({
        missionId,
        type: 'validation.started',
        summary: 'validation',
        payload: { validationId: 'validation-a' },
      }),
      createMissionEvent({
        missionId,
        type: 'validation.blocked',
        summary: 'blocked',
        payload: { validationId: 'validation-a' },
      }),
      createMissionEvent({ missionId, type: 'git.branch.changed', summary: 'git' }),
      createMissionEvent({ missionId, type: 'github.pr.created', summary: 'github' }),
      createMissionEvent({ missionId, type: 'checkpoint.created', summary: 'checkpoint' }),
      createMissionEvent({ missionId, type: 'memory.recalled', summary: 'memory' }),
      createMissionEvent({ missionId, type: 'web.request.completed', summary: 'web' }),
      createMissionEvent({ missionId, type: 'mcp.call.completed', summary: 'mcp' }),
      createMissionEvent({ missionId, type: 'subagent.started', summary: 'subagent' }),
      createMissionEvent({ missionId, type: 'skill.completed', summary: 'skill' }),
    ]
    const filterExpectations: Record<MissionEventFilter, number> = {
      all: events.length,
      agent: 2,
      files: 2,
      tools: 1,
      validation: 2,
      git: 2,
      checkpoints: 1,
      memory: 1,
      'web-mcp': 2,
      'subagents-skills': 2,
    }
    for (const [filter, expectedTotal] of Object.entries(filterExpectations) as [
      MissionEventFilter,
      number,
    ][]) {
      expect(paginateMissionEvents(events, { filter, offset: -10, limit: 10_000 }).total).toBe(
        expectedTotal,
      )
    }
    expect(eventMatchesFilter(events[0]!, 'files')).toBe(false)
    expect(recoverInterruptedMissionEvents(missionId, events)).toHaveLength(1)
    expect(() => createMissionEvent({ missionId, type: '', summary: 'x' })).toThrow('type')
    expect(() => createMissionEvent({ missionId, type: 'x', summary: '   ' })).toThrow('summary')

    const circular: Record<string, unknown> = { keep: 'value' }
    circular['self'] = circular
    const redacted = redactMissionRecord({
      Authorization: 'Bearer abcdefghijklmnop',
      url: 'https://example.test/?api_key=secret-token-value',
      nested: { privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----' },
      array: Array.from({ length: 205 }, (_, index) => index),
      circular,
      fn: () => 'not persisted',
      symbolValue: Symbol('not persisted'),
    })
    expect(JSON.stringify(redacted)).toContain('[CIRCULAR]')
    expect(JSON.stringify(redacted)).not.toContain('abcdefghijklmnop')
    expect(containsRepresentativeSecret(redacted)).toBe(false)
    expect(redactMissionText('sk-ant-abcdefghijklmnop and AIza12345678901234567890')).toContain(
      '[REDACTED]',
    )
    expect(sanitizeMissionPayload(undefined)).toBeUndefined()
    expect(sanitizeMissionPayload('plain text')).toEqual({ value: 'plain text' })
    expect(sanitizeMissionPayload({ huge: 'x'.repeat(30_000) }, {}, 1024)?.['truncated']).toBe(
      true,
    )
  })
})
