import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'

describe('mission interrupted operation recovery', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('marks durable started events interrupted on resume', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-interrupted-'))
    roots.push(root)
    const service = new MissionService({ workspaceRoot: root, generateId: () => ID })
    const created = await service.create({
      name: 'Interrupted',
      objective: 'Recover',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    service.appendEvent(created.id, 'validation.started', 'Tests started', {
      operationId: 'validation-1',
      validationId: 'validation-1',
    })
    const current = service.get(created.id)
    const paused = service.pause(created.id, current.revision)
    service.resume(created.id, paused.revision)
    expect(
      service.readEvents(created.id).some((event) => event.type === 'validation.interrupted'),
    ).toBe(true)
  })
})
