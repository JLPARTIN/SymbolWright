import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('paused mission continuation', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('resumes to active through an explicit lifecycle action', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-paused-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const created = await service.create({
      name: 'Pause',
      objective: 'Resume explicitly',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    const paused = service.pause(created.id, created.revision)
    expect(paused.status).toBe('PAUSED')
    expect(service.resume(paused.id, paused.revision).status).toBe('ACTIVE')
  })
})
