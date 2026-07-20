import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { MissionService } from '../../mission/mission-service.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'

describe('end-to-end mission restart persistence', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('recovers conversation, real file state, events, checkpoint link, and validation evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codemind-mission-resume-'))
    roots.push(root)
    await runGitCommand(['init'], root)
    await runGitCommand(['config', 'user.email', 'test@example.com'], root)
    await runGitCommand(['config', 'user.name', 'Test'], root)
    writeFileSync(join(root, 'a.txt'), 'before')
    await runGitCommand(['add', 'a.txt'], root)
    await runGitCommand(['commit', '-m', 'initial'], root)

    const first = new MissionService({ workspaceRoot: root, generateId: () => ID })
    const mission = await first.create({
      name: 'Resume proof', objective: 'Persist all linked state', workspaceKind: 'repository',
      repositoryPath: '.', runtimeMode: 'APPROVED_EXECUTION', labels: [],
    })
    first.recordAgentUserMessage(mission.id, 'Edit a.txt', 'APPROVED_EXECUTION', 'openai', 'fake')
    first.recordAgentResult(
      mission.id,
      [{ role: 'user', content: 'Edit a.txt' }, { role: 'assistant', content: 'Edited' }],
      'Edited',
      'completed',
    )
    first.recordFileOpened(mission.id, 'a.txt', 'before-hash')
    writeFileSync(join(root, 'a.txt'), 'after')
    first.recordFileSaved(mission.id, 'a.txt', 'after-hash', {
      checkpointId: 'checkpoint-resume',
      createdAt: '2026-07-20T00:00:00.000Z',
      paths: ['a.txt'],
    })
    first.recordValidation(mission.id, {
      id: 'validation-resume', command: 'npm test', startedAt: '2026-07-20T00:00:00.000Z',
      completedAt: '2026-07-20T00:01:00.000Z', exitCode: 0, status: 'passed', summary: 'Tests passed',
    })

    const second = new MissionService({ workspaceRoot: root })
    const recovered = second.get(mission.id)
    expect(recovered.agent.messages).toHaveLength(2)
    expect(recovered.workspace.activeFilePath).toBe('a.txt')
    expect(recovered.references.checkpointIds).toContain('checkpoint-resume')
    expect(recovered.evidence.validationRuns[0]?.status).toBe('passed')
    expect(second.readEvents(mission.id).length).toBeGreaterThanOrEqual(5)
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('after')
  })
})
