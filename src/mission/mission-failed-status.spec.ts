import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('failed mission status', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('records an explicit failure state and event', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-failed-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const created = await service.create({
      name: 'Failure',
      objective: 'Record',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    const failed = service.fail(created.id, created.revision, 'Validation could not recover')
    expect(failed.status).toBe('FAILED')
    expect(service.readEvents(created.id).some((event) => event.type === 'mission.failed')).toBe(
      true,
    )
  })
})
