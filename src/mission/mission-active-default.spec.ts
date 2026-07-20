import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('new mission status', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('starts active and records mission.created', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-active-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Active', objective: 'Start', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    expect(mission.status).toBe('ACTIVE')
    expect(service.readEvents(mission.id)[0]?.type).toBe('mission.created')
  })
})
