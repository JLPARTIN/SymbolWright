import { describe, expect, it } from 'vitest'

import { buildAutonomyViewClientScript, renderAutonomyViewHtml } from './autonomy-view.js'

describe('AI Mission Control view', () => {
  it('renders a real operator surface for autonomous execution and releases', () => {
    const html = renderAutonomyViewHtml()

    expect(html).toContain('data-view="autonomy"')
    expect(html).toContain('AI Mission Control')
    expect(html).toContain('autonomy-actions')
    expect(html).toContain('autonomy-dashboard')
    expect(html).toContain('autonomy-release')
    expect(html).not.toContain('coming soon')
  })

  it('wires every autonomy control to the authenticated mission API', () => {
    const script = buildAutonomyViewClientScript()

    for (const action of ['start', 'pause', 'resume', 'retry', 'cancel', 'release']) {
      expect(script).toContain(`'${action}'`)
    }
    expect(script).toContain("'/api/missions/' + encodeURIComponent(missionId) + '/autonomy'")
    expect(script).toContain("authorization: 'Bearer ' + appState.codemindKey")
    expect(script).toContain('window.setInterval')
  })

  it('escapes mission, task, file, release, and PR content before rendering', () => {
    const script = buildAutonomyViewClientScript()

    expect(script).toContain('appEscapeHtml(mission ? mission.name : missionId)')
    expect(script).toContain('appEscapeHtml(mission ? mission.objective : missionId)')
    expect(script).toContain('appEscapeHtml(task.objective')
    expect(script).toContain('appEscapeHtml(file)')
    expect(script).toContain('appEscapeHtml(release.state')
    expect(script).toContain('appEscapeHtml(pullRequest.body')
    expect(script).not.toContain('innerHTML = pullRequest.body')
  })

  it('does not fabricate merge readiness when the server has not supplied it', () => {
    const script = buildAutonomyViewClientScript()

    expect(script).toContain('Merge readiness</strong><br>Unavailable')
    expect(script).toContain('Repository impact</strong><br>Unavailable')
  })

  it('renders GitHub PR packet controls with writes off by default', () => {
    const html = renderAutonomyViewHtml()

    expect(html).toContain('GitHub PR Packet')
    expect(html).toContain('id="pr-packet-allow-writes"')
    expect(html).not.toMatch(/id="pr-packet-allow-writes"[^>]*checked/)
    expect(html).toContain('id="pr-packet-generate-btn"')
  })

  it('only enables Open Pull Request when the server reports both write and PR-creation policy allowed', () => {
    const script = buildAutonomyViewClientScript()

    expect(script).toContain(
      'const publishEnabled = Boolean(packet.pullRequestCreationAllowed && packet.writesAllowed);',
    )
    expect(script).toContain("(publishEnabled ? '' : ' disabled')")
  })

  it('calls the real PR packet and publish endpoints for the active mission', () => {
    const script = buildAutonomyViewClientScript()

    expect(script).toContain(
      "'/api/missions/' + encodeURIComponent(missionId) + '/github-pr-packet'",
    )
    expect(script).toContain(
      "'/api/missions/' + encodeURIComponent(missionId) + '/github-pr-packet/publish'",
    )
  })

  it('escapes PR packet content before rendering', () => {
    const script = buildAutonomyViewClientScript()

    expect(script).toContain('appEscapeHtml(packet.branchName)')
    expect(script).toContain('appEscapeHtml(packet.prTitle)')
    expect(script).toContain('appEscapeHtml(packet.prBody)')
    expect(script).not.toContain('innerHTML = packet.prBody')
  })
})
