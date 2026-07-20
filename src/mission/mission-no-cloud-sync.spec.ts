import { describe, expect, it } from 'vitest'

import { renderMissionsViewHtml } from '../app/views/missions-view.js'

describe('mission synchronization boundary', () => {
  it('describes local filesystem persistence without cloud-sync claims', () => {
    const html = renderMissionsViewHtml()
    expect(html).toContain('.codemind/missions/')
    expect(html.toLowerCase()).not.toContain('cloud sync enabled')
  })
})
