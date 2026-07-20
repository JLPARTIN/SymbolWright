import { describe, expect, it } from 'vitest'

import { buildRepositoryMissionBridgeScript } from './repository-mission-bridge.js'

describe('repository mission bridge', () => {
  it('links file, diff, branch, commit, push, PR, and checkpoint events', () => {
    const script = buildRepositoryMissionBridgeScript()
    for (const kind of [
      'file-opened',
      'file-saved',
      'file-conflict',
      'diff-viewed',
      'repository-state',
      'branch-changed',
      'commit-created',
      'push-completed',
      'pr-created',
      'checkpoint-restored',
    ]) {
      expect(script).toContain(kind)
    }
  })

  it('uses mission ids as checkpoint sessions and restores active files', () => {
    const script = buildRepositoryMissionBridgeScript()
    expect(script).toContain('requestBody.sessionId = activeMissionId')
    expect(script).toContain('/api/checkpoints?session=')
    expect(script).toContain('mission.workspace.activeFilePath')
    expect(script).toContain('restoreMissionFile')
  })

  it('does not switch repository branches automatically', () => {
    const script = buildRepositoryMissionBridgeScript()
    expect(script).not.toContain('git checkout')
    expect(script).toContain('Repository drift detected')
  })
})
