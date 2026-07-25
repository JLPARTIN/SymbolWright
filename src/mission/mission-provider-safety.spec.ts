import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

describe('mission provider safety', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('stores provider id and model only', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-provider-'))
    roots.push(root)
    const service = new MissionService({
      workspaceRoot: root,
      env: { ANTHROPIC_API_KEY: 'sk-ant-secret-value' },
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Provider',
      objective: 'No key persistence',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      activeProviderId: 'anthropic',
      model: 'claude-test',
      labels: [],
    })
    const persisted = readFileSync(
      join(root, '.symbolwright', 'missions', mission.id, 'mission.json'),
      'utf8',
    )
    expect(persisted).toContain('anthropic')
    expect(persisted).toContain('claude-test')
    expect(persisted).not.toContain('sk-ant-secret-value')
  })
})
