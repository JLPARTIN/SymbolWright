import { describe, expect, it } from 'vitest'

import { buildMissionsViewClientScript } from '../app/views/missions-view.js'

describe('mission repository reconciliation choices', () => {
  it('offers current state, recorded branch, read-only, and cancel choices', () => {
    const script = buildMissionsViewClientScript()
    expect(script).toContain('Continue with current repository state')
    expect(script).toContain('Switch to recorded branch if safe')
    expect(script).toContain('Open mission read-only')
    expect(script).toContain('Cancel')
    expect(script).not.toContain('automatically switch')
  })
})
