import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission open file resume', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('persists multiple open files and the active file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-open-files-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Files', objective: 'Resume selection', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    service.recordFileOpened(mission.id, 'a.ts', 'hash-a')
    service.recordFileOpened(mission.id, 'b.ts', 'hash-b')
    const restarted = new MissionService({ workspaceRoot: root }).get(mission.id)
    expect(restarted.workspace.openFiles.map((file) => file.path)).toEqual(['a.ts', 'b.ts'])
    expect(restarted.workspace.activeFilePath).toBe('b.ts')
  })
})
