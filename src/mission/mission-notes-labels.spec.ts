import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission labels and notes', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('renames and updates deduplicated labels and notes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-labels-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const created = await service.create({
      name: 'Original', objective: 'Metadata', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: ['ci'],
    })
    const updated = service.patch(created.id, {
      revision: created.revision, name: 'Renamed', labels: ['ci', 'ci', 'release'], notes: 'Ready soon',
    })
    expect(updated.name).toBe('Renamed')
    expect(updated.labels).toEqual(['ci', 'release'])
    expect(updated.notes).toBe('Ready soon')
  })
})
