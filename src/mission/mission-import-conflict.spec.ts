import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission import id conflicts', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('creates a new paused id when the imported id already exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-import-conflict-'))
    roots.push(root)
    const ids = [
      'mission_11111111-1111-4111-8111-111111111111',
      'mission_22222222-2222-4222-8222-222222222222',
    ]
    let index = 0
    const service = new MissionService({ workspaceRoot: root, generateId: () => ids[index++]! })
    const original = await service.create({
      name: 'Original', objective: 'Export', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    const imported = service.import(service.export(original.id))
    expect(imported.id).toBe(ids[1])
    expect(imported.status).toBe('PAUSED')
    expect(service.list().total).toBe(2)
  })
})
