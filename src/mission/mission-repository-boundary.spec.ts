import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService, MissionStateConflictError } from './mission-service.js'

describe('mission repository boundary', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('rejects repository roots outside the active CodeMind workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-boundary-'))
    roots.push(root)
    const service = new MissionService({ workspaceRoot: root })
    await expect(
      service.create({
        name: 'Escape',
        objective: 'No traversal',
        workspaceKind: 'repository',
        repositoryPath: '../../etc',
        runtimeMode: 'READ_ONLY',
        labels: [],
      }),
    ).rejects.toBeInstanceOf(MissionStateConflictError)
  })
})
