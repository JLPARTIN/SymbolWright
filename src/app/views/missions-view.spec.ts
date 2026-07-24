import { describe, expect, it } from 'vitest'

import { buildMissionsViewClientScript, renderMissionsViewHtml } from './missions-view.js'

describe('Missions view', () => {
  it('renders creation, lifecycle, timeline, import/export, and deletion controls', () => {
    const html = renderMissionsViewHtml()
    expect(html).toContain('New Mission')
    expect(html).toContain('Recent Missions')
    expect(html).toContain('Timeline')
    expect(html).toContain('Import Mission Bundle')
    expect(html).toContain('mission-runtime-mode')
    expect(html).toContain('mission-event-filter')
  })

  it('includes resume reconciliation and revision conflict behavior', () => {
    const script = buildMissionsViewClientScript()
    expect(script).toContain('This repository changed since the mission was last active')
    expect(script).toContain('switch-recorded-branch')
    expect(script).toContain('activeMissionReadOnly')
    expect(script).toContain('result.status === 409')
    expect(script).toContain('codemind_active_mission_id')
  })

  it('escapes mission-controlled content rather than injecting raw payload html', () => {
    const script = buildMissionsViewClientScript()
    expect(script).toContain('appEscapeHtml(mission.name)')
    expect(script).toContain('appEscapeHtml(event.summary)')
    expect(script).not.toContain('innerHTML = event.payload')
  })

  it('contains narrow-layout-compatible class contracts', () => {
    const html = renderMissionsViewHtml()
    expect(html).toContain('mission-layout')
    expect(html).toContain('mission-sidebar')
    expect(html).toContain('mission-detail-column')
  })

  it('offers an Autonomy timeline filter so autonomous mission events are not hidden by default', () => {
    const html = renderMissionsViewHtml()
    expect(html).toContain('<option value="autonomy">Autonomy</option>')
  })
})
