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

  it('offers External Repository Intake controls with GitHub writes off by default', () => {
    const html = renderMissionsViewHtml()
    expect(html).toContain('External Repository Intake')
    expect(html).toContain('id="intake-target"')
    expect(html).toContain('id="intake-mode"')
    expect(html).toContain('Analyze only (no clone)')
    expect(html).toContain('Duplicate/clone into workspace')
    expect(html).toContain('id="intake-allow-writes"')
    expect(html).not.toMatch(/id="intake-allow-writes"[^>]*checked/)
  })

  it('calls the real intake API and never shows a created-mission button unless the API actually returned one', () => {
    const script = buildMissionsViewClientScript()
    expect(script).toContain("missionFetchJson('/api/github/intake'")
    expect(script).toContain('intake-open-mission-btn')
    expect(script).toContain('if (data.mission)')
  })

  it('escapes intake-derived content rather than injecting raw payload html', () => {
    const script = buildMissionsViewClientScript()
    expect(script).toContain('appEscapeHtml(data.target.canonicalHttpsUrl)')
    expect(script).toContain('appEscapeHtml(ecosystems)')
  })
})
