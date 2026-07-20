import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission checkpoint labels', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('labels existing checkpoint references without copying checkpoint content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-checkpoint-label-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Labels', objective: 'Name checkpoint', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    service.attachCheckpoint(mission.id, {
      checkpointId: 'checkpoint-1', createdAt: '2026-07-20T00:00:00.000Z', paths: ['a.ts'],
    })
    const labeled = service.labelCheckpoint(mission.id, 'checkpoint-1', 'Before refactor')
    expect(labeled.references.checkpointLinks[0]?.label).toBe('Before refactor')
    expect(JSON.stringify(labeled.references.checkpointLinks)).not.toContain('originalContent')
  })
})
