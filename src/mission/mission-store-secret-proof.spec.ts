import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from './mission-service.js'

function readAllFiles(root: string): string {
  return readdirSync(root).map((name) => {
    const target = join(root, name)
    return statSync(target).isDirectory() ? readAllFiles(target) : readFileSync(target, 'utf8')
  }).join('\n')
}

describe('mission directory secret proof', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('does not persist representative access, provider, GitHub, cookie, query, or private-key secrets', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-secret-proof-'))
    roots.push(root)
    const secrets = {
      CODEMIND_API_KEY: 'codemind-local-secret-value',
      OPENAI_API_KEY: 'sk-openai-super-secret-value',
      GITHUB_TOKEN: 'ghp_abcdefghijklmnopqrstuvwxyz123456',
    }
    const service = new MissionService({
      workspaceRoot: root,
      env: secrets,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Secret proof',
      objective: 'Authorization: Bearer codemind-local-secret-value',
      workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY',
      activeProviderId: 'openai', model: 'safe-model', labels: [],
      notes: 'Cookie: session=sk-openai-super-secret-value https://example.test/?token=ghp_abcdefghijklmnopqrstuvwxyz123456 -----BEGIN PRIVATE KEY----- hidden -----END PRIVATE KEY-----',
    })
    service.appendEvent(mission.id, 'mcp.call.completed', 'MCP completed', {
      environment: { OPENAI_API_KEY: secrets.OPENAI_API_KEY },
      Authorization: `Bearer ${secrets.CODEMIND_API_KEY}`,
    })

    const persisted = readAllFiles(join(root, '.codemind', 'missions'))
    expect(persisted).not.toContain(secrets.CODEMIND_API_KEY)
    expect(persisted).not.toContain(secrets.OPENAI_API_KEY)
    expect(persisted).not.toContain(secrets.GITHUB_TOKEN)
    expect(persisted).not.toContain('BEGIN PRIVATE KEY')
    expect(persisted).toContain('openai')
    expect(persisted).toContain('safe-model')
  })
})
