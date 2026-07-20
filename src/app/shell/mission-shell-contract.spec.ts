import { describe, expect, it } from 'vitest'

import { renderAppShellHtml } from './app-shell-html.js'

describe('mission shell contracts', () => {
  it('renders Missions as a first-class route and active headers', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('data-nav="missions"')
    expect(html).toContain('data-view="missions"')
    expect(html).toContain('active-mission-header')
    expect(html).toContain('agent-mission-header')
  })

  it('includes mobile/narrow mission layout CSS', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('@media (max-width: 900px)')
    expect(html).toContain('.repo-layout, .mission-layout { grid-template-columns: 1fr; }')
    expect(html).toContain('@media (max-width: 760px)')
  })

  it('does not render secret values into mission markup', () => {
    const html = renderAppShellHtml()
    expect(html).not.toContain('GITHUB_TOKEN=')
    expect(html).not.toContain('CODEMIND_API_KEY=')
  })
})
