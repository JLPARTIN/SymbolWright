import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('completed mission browsing', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('lists and reads completed missions without reopening them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completed-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const created = await service.create({
      name: 'Complete', objective: 'Browse later', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    const completed = service.complete(created.id, created.revision)
    expect(service.list().missions[0]?.status).toBe('COMPLETED')
    expect(service.get(completed.id).status).toBe('COMPLETED')
  })
})
