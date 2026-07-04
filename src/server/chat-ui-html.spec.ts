import { describe, expect, it } from 'vitest'

import { renderChatUiHtml } from './chat-ui-html.js'

describe('renderChatUiHtml', () => {
  it('renders a page that talks to the real chat API endpoints', () => {
    const html = renderChatUiHtml()

    expect(html).toContain('CodeMind Chat')
    expect(html).toContain('/api/providers')
    expect(html).toContain('/api/providers/register')
    expect(html).toContain('/api/providers/test')
    expect(html).toContain('/api/chat')
  })

  it('wires an Agent mode toggle to /api/agent with a runtime-mode selector', () => {
    const html = renderChatUiHtml()

    expect(html).toContain('agent-mode-toggle')
    expect(html).toContain('/api/agent')
    expect(html).toContain('agent-mode-select')
    expect(html).toContain('READ_ONLY')
    expect(html).toContain('PROPOSAL_ONLY')
    expect(html).toContain('APPROVED_EXECUTION')
    expect(html).toContain('tool_call_start')
    expect(html).toContain('tool_call_end')
    expect(html).toContain('finalMessages')
  })

  it('renders assistant and user text with textContent, not innerHTML, to avoid XSS', () => {
    const html = renderChatUiHtml()

    expect(html).toContain('bubble.textContent')
    expect(html).not.toMatch(/bubble\.innerHTML/)
  })

  it('never bakes a provider or CodeMind key into the static page', () => {
    const html = renderChatUiHtml()

    expect(html).not.toMatch(/sk-[a-zA-Z0-9]/)
    expect(html).not.toMatch(/anthropic-[a-zA-Z0-9]/)
  })
})
