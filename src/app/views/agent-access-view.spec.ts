import { describe, expect, it } from 'vitest'

import { buildAgentAccessViewClientScript, renderAgentAccessViewHtml } from './agent-access-view.js'

describe('renderAgentAccessViewHtml', () => {
  it('renders the agent-access view section', () => {
    const html = renderAgentAccessViewHtml()
    expect(html).toContain('data-view="agent-access"')
  })

  it('lists every permission profile as a selectable option, with the Coding Agent one marked recommended', () => {
    const html = renderAgentAccessViewHtml()
    expect(html).toContain('value="repository-analyst"')
    expect(html).toContain('value="coding-agent"')
    expect(html).toContain('value="maintainer-agent"')
    expect(html).toContain('value="temporary-administrator"')
    expect(html).toContain('value="custom"')
    expect(html).toMatch(/coding-agent"[^<]*<\/option>[\s\S]*recommended/)
  })

  it('does not render a plaintext-token box visible by default', () => {
    const html = renderAgentAccessViewHtml()
    expect(html).toContain('id="agent-access-new-token" style="display:none"')
  })
})

describe('buildAgentAccessViewClientScript', () => {
  it('calls the real access-grant REST API, not a mock', () => {
    const script = buildAgentAccessViewClientScript()
    expect(script).toContain('/api/v1/access-grants')
    expect(script).toContain('/api/v1/device-authorization/pending')
    expect(script).toContain('/api/v1/audit/agent-access')
  })

  it('confirms before revoking a grant', () => {
    const script = buildAgentAccessViewClientScript()
    const fnBody = script.slice(
      script.indexOf('async function agentAccessGrantAction'),
      script.indexOf('async function agentAccessInspectGrant'),
    )
    expect(fnBody).toContain('window.confirm(')
  })

  it('registers the agent-access router view', () => {
    const script = buildAgentAccessViewClientScript()
    expect(script).toContain("registerRouterViewInit('agent-access'")
  })

  it('shows a returned plaintext token exactly once via the dedicated box, never logging it', () => {
    const script = buildAgentAccessViewClientScript()
    expect(script).toContain('agent-access-new-token-value')
    expect(script).not.toContain('console.log')
  })
})
