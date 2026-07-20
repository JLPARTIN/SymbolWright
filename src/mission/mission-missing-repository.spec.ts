import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('missing mission repository', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('keeps history available and returns a structured reconciliation warning', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-missing-repo-'))
    roots.push(root)
    const repo = join(root, 'repo')
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Missing', objective: 'Browse anyway', workspaceKind: 'repository', repositoryPath: 'repo', runtimeMode: 'READ_ONLY', labels: [],
    })
    service.recordAgentResult(mission.id, [{ role: 'assistant', content: 'History' }], 'History', 'completed')
    rmSync(repo, { recursive: true, force: true })
    const reconciliation = await service.reconcileRepository(mission.id)
    expect(reconciliation.repositoryAvailable).toBe(false)
    expect(reconciliation.warnings[0]).toContain('Agent history and evidence are still accessible')
    expect(service.get(mission.id).agent.messages).toHaveLength(1)
  })
})
