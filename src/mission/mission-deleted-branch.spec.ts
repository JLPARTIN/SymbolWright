import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { MissionService } from './mission-service.js'

describe('deleted mission branch', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('reports a deleted branch without recreating it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-deleted-branch-'))
    roots.push(root)
    await runGitCommand(['init'], root)
    await runGitCommand(['config', 'user.email', 'test@example.com'], root)
    await runGitCommand(['config', 'user.name', 'Test'], root)
    writeFileSync(join(root, 'a.txt'), 'a')
    await runGitCommand(['add', 'a.txt'], root)
    await runGitCommand(['commit', '-m', 'initial'], root)
    await runGitCommand(['checkout', '-b', 'recorded'], root)
    const service = new MissionService({
      workspaceRoot: root,
      generateId: () => 'mission_11111111-1111-4111-8111-111111111111',
    })
    const mission = await service.create({
      name: 'Branch', objective: 'Do not recreate', workspaceKind: 'repository', repositoryPath: '.', runtimeMode: 'READ_ONLY', labels: [],
    })
    await runGitCommand(['checkout', 'master'], root)
    await runGitCommand(['branch', '-D', 'recorded'], root)
    const reconciliation = await service.reconcileRepository(mission.id)
    expect(reconciliation.branchExists).toBe(false)
    expect(reconciliation.warnings.join(' ')).toContain('no longer exists')
    expect((await runGitCommand(['show-ref', '--verify', '--quiet', 'refs/heads/recorded'], root)).exitCode).not.toBe(0)
  })
})
