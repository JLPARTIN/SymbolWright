import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission deletion boundary', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('removes mission-owned artifacts but preserves repository, checkpoints, and memory stores', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-delete-boundary-'))
    roots.push(root)
    writeFileSync(join(root, 'repository.txt'), 'keep')
    mkdirSync(join(root, '.codemind', 'checkpoints'), { recursive: true })
    mkdirSync(join(root, '.codemind', 'memory'), { recursive: true })
    writeFileSync(join(root, '.codemind', 'checkpoints', 'keep.json'), '{}')
    writeFileSync(join(root, '.codemind', 'memory', 'keep.db'), 'memory')
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Delete', objective: 'Mission only', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    const missionDir = join(root, '.codemind', 'missions', mission.id)
    writeFileSync(join(missionDir, 'artifacts', 'export.json'), '{}')
    service.delete(mission.id, mission.revision, true)
    expect(existsSync(missionDir)).toBe(false)
    expect(existsSync(join(root, 'repository.txt'))).toBe(true)
    expect(existsSync(join(root, '.codemind', 'checkpoints', 'keep.json'))).toBe(true)
    expect(existsSync(join(root, '.codemind', 'memory', 'keep.db'))).toBe(true)
  })
})
