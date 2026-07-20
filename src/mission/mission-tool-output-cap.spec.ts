import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission tool output boundary', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('stores a bounded redacted excerpt and full-output hash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-tool-output-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      env: { GITHUB_TOKEN: 'ghp_abcdefghijklmnopqrstuvwxyz123456' },
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Tool output',
      objective: 'Bound it',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    service.recordToolStarted(mission.id, 'tool-1', 'bash')
    service.recordToolCompleted(
      mission.id,
      'tool-1',
      'bash',
      'ghp_abcdefghijklmnopqrstuvwxyz123456\n' + 'x'.repeat(20_000),
      false,
      10,
    )
    const evidence = service.get(mission.id).evidence.toolCalls[0]
    expect(evidence?.outputExcerpt?.length).toBeLessThan(5_000)
    expect(evidence?.outputExcerpt).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456')
    expect(evidence?.outputHash).toHaveLength(64)
  })
})
