import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission mutation metadata', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('increments revision on every persisted mutation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-metadata-'))
    roots.push(root)
    const service = new MissionService({ workspaceRoot: root, generateId: () => 'mission_11111111-1111-4111-8111-111111111111' })
    const mission = await service.create({ name: 'Meta', objective: 'Revision', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [] })
    const patched = service.patch(mission.id, { revision: mission.revision, notes: 'changed' })
    expect(patched.revision).toBe(mission.revision + 1)
  })
})
