import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkpointBeforeWrite } from './checkpoint-tool-hook.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'

describe('checkpoint mission linkage', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('returns created checkpoint metadata without duplicating snapshot contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-mission-'))
    roots.push(root)
    const metadata = checkpointBeforeWrite(
      {
        cwd: root,
        sessionId: 'mission_11111111-1111-4111-8111-111111111111',
        policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
      },
      'edit_file',
      [{ targetPath: 'a.txt', resolvedPath: join(root, 'a.txt'), existedBefore: false, originalContent: null }],
      'mission edit',
    )
    expect(metadata?.sessionId).toBe('mission_11111111-1111-4111-8111-111111111111')
    expect(metadata?.files[0]?.targetPath).toBe('a.txt')
  })
})
