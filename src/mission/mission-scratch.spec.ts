import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission scratch workspace attachment', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('keeps scratch local-only until an explicit attach action', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-scratch-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Scratch',
      objective: 'Attach explicitly',
      workspaceKind: 'scratch',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    expect(mission.workspace.scratchAttached).toBe(false)
    expect(mission.workspace.scratchState).toBeUndefined()
    const attached = service.attachScratchWorkspace(mission.id, mission.revision, {
      schemaVersion: 1,
      activeFileId: 'file-1',
      files: [{ id: 'file-1', name: 'a.ts' }],
    })
    expect(attached.workspace.scratchAttached).toBe(true)
    expect(attached.workspace.scratchState?.['activeFileId']).toBe('file-1')
  })
})
