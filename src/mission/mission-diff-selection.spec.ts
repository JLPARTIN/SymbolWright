import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission diff resume', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('persists the selected diff path and timeline event', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-diff-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Diff',
      objective: 'Resume diff',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    service.recordDiffViewed(mission.id, 'src/a.ts')
    expect(
      new MissionService({ workspaceRoot: root }).get(mission.id).workspace.selectedDiffPath,
    ).toBe('src/a.ts')
    expect(
      service.readEvents(mission.id).some((event) => event.type === 'workspace.diff.viewed'),
    ).toBe(true)
  })
})
