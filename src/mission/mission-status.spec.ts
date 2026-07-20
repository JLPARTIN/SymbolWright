import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService, MissionStateConflictError } from './mission-service.js'

describe('mission status rules', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('abandons missions and keeps terminal missions browsable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-status-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const created = await service.create({
      name: 'Abandon',
      objective: 'Stop safely',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    const abandoned = service.abandon(created.id, created.revision)
    expect(abandoned.status).toBe('ABANDONED')
    expect(service.get(abandoned.id).status).toBe('ABANDONED')
    expect(() => service.complete(abandoned.id, abandoned.revision)).toThrow(
      MissionStateConflictError,
    )
  })
})
