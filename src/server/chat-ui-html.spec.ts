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
