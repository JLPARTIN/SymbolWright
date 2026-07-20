import { describe, expect, it } from 'vitest'

import { buildMissionsViewClientScript } from '../app/views/missions-view.js'

describe('mission branch reconciliation safety', () => {
  it('uses an explicit recorded-branch action and never creates a branch', () => {
    const script = buildMissionsViewClientScript()
    expect(script).toContain('switch-recorded-branch')
    expect(script).not.toContain('/api/repository/branches')
  })
})
