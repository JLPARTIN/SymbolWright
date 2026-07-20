import { describe, expect, it } from 'vitest'

import { buildMissionsViewClientScript } from '../app/views/missions-view.js'

describe('mission pending draft safety', () => {
  it('does not auto-send pending mission drafts', () => {
    const script = buildMissionsViewClientScript()
    expect(script).not.toContain("document.getElementById('send-btn').click()")
  })
})
