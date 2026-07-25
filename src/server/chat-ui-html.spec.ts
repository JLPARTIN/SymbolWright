import { describe, expect, it } from 'vitest'

import { renderChatBodyMarkup, renderChatScripts } from './chat-ui-html.js'

// `renderChatBodyMarkup()` + `renderChatScripts()` is exactly what the live
// unified app shell's Agent view embeds (`src/app/views/agent-view.ts`) --
// exercising them together here tests the real production markup/script
// pairing directly, rather than a standalone page wrapper nothing serves.
function renderChatUi(): string {
  return renderChatBodyMarkup() + renderChatScripts()
}

describe('chat body markup and scripts', () => {
  it('renders a page that talks to the real chat API endpoints', () => {
    const html = renderChatUi()

    expect(html).toContain('SymbolWright Chat')
    expect(html).toContain('/api/providers')
    expect(html).toContain('/api/providers/register')
    expect(html).toContain('/api/providers/test')
    expect(html).toContain('/api/chat')
  })

  it('wires an Agent mode toggle to /api/agent with a runtime-mode selector', () => {
    const html = renderChatUi()

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
    const html = renderChatUi()

    expect(html).toContain('bubble.textContent')
    expect(html).not.toMatch(/bubble\.innerHTML/)
  })

  it('never bakes a provider or SymbolWright key into the static page', () => {
    const html = renderChatUi()

    expect(html).not.toMatch(/sk-[a-zA-Z0-9]/)
    expect(html).not.toMatch(/anthropic-[a-zA-Z0-9]/)
  })

  it('offers a browser-only mode that needs no provider API key', () => {
    const html = renderChatUi()

    expect(html).toContain('browser-mode-btn')
    expect(html).toContain('api-mode-btn')
    expect(html).toContain('/api/local-status')
    expect(html).toContain('no API key')
  })

  it('always shows the current operating mode', () => {
    const html = renderChatUi()

    expect(html).toContain('mode-status')
    expect(html).toContain('Current mode:')
    expect(html).toContain('Browser-only')
    expect(html).toContain('API-backed')
  })

  it('activates the provider by testing it after save, and reports active/invalid config', () => {
    const html = renderChatUi()

    expect(html).toContain('async function saveProvider')
    expect(html).toContain('await testProvider(providerId)')
    expect(html).toContain('Active:')
    expect(html).toContain('Invalid config:')
  })

  it('submits the SymbolWright access key and the provider API key on Enter', () => {
    const html = renderChatUi()

    const symbolWrightKeyBlock = html.slice(
      html.indexOf("el('symbolwright-key').addEventListener('keydown'"),
    )
    expect(symbolWrightKeyBlock.slice(0, 200)).toContain('connect()')

    const apiKeyBlock = html.slice(html.indexOf("el('api-key-field').addEventListener('keydown'"))
    expect(apiKeyBlock.slice(0, 200)).toContain('saveProvider()')
  })

  it('warns that the SymbolWright access key is stored in browser local storage', () => {
    const html = renderChatUi()

    expect(html).toContain('local storage')
    expect(html).toContain('shared or public computer')
  })

  it('accepts workspace code-intelligence drafts from query parameters', () => {
    const html = renderChatUi()

    expect(html).toContain('applyWorkspaceDraftFromUrl')
    expect(html).toContain("params.get('draft')")
    expect(html).toContain("params.get('agentMode')")
    expect(html).toContain('Workspace code-intelligence draft loaded')
    expect(html).toContain("el('agent-mode-toggle').checked = true")
  })
})
