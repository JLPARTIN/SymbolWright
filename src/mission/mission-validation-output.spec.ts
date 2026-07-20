import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'
import { sha256Text } from './mission-redaction.js'

describe('mission validation evidence', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('stores structured status with bounded excerpt and output hash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-validation-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Validation', objective: 'Evidence', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    const output = 'test output'
    service.recordValidation(mission.id, {
      id: 'validation-1', command: 'npm test', startedAt: '2026-07-20T00:00:00.000Z',
      completedAt: '2026-07-20T00:01:00.000Z', exitCode: 0, status: 'passed', summary: 'Tests passed',
      outputExcerpt: output, outputHash: sha256Text(output),
    })
    const evidence = service.get(mission.id).evidence.validationRuns[0]
    expect(evidence?.status).toBe('passed')
    expect(evidence?.outputHash).toHaveLength(64)
  })
})
