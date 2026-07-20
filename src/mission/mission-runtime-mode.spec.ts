import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission runtime mode resume', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('persists the latest Agent runtime mode to disk', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-runtime-mode-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Mode',
      objective: 'Resume mode',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
    service.recordAgentUserMessage(mission.id, 'edit', 'APPROVED_EXECUTION', 'openai')
    const restarted = new MissionService({ workspaceRoot: root })
    expect(restarted.get(mission.id).agent.runtimeMode).toBe('APPROVED_EXECUTION')
  })
})
