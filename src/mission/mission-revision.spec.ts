import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionRevisionConflictError, MissionService } from './mission-service.js'

describe('mission concurrent tab revisions', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('returns the current mission when another tab already saved', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-revision-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const loadedInTwoTabs = await service.create({
      name: 'Revision',
      objective: 'No lost updates',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    service.patch(loadedInTwoTabs.id, { revision: loadedInTwoTabs.revision, notes: 'tab one' })
    try {
      service.patch(loadedInTwoTabs.id, { revision: loadedInTwoTabs.revision, notes: 'tab two' })
      throw new Error('Expected revision conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(MissionRevisionConflictError)
      expect((error as MissionRevisionConflictError).current.notes).toBe('tab one')
    }
  })
})
