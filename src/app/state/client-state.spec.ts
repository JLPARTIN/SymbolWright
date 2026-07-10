import { describe, expect, it } from 'vitest'

import { buildClientStateScript } from './client-state.js'

describe('buildClientStateScript', () => {
  it('defines a shared appState object with subscribe/set', () => {
    const script = buildClientStateScript()
    expect(script).toContain('const appState = {')
    expect(script).toContain('subscribe(fn)')
    expect(script).toContain('set(patch)')
  })

  it('includes pendingAgentDraft for the workspace-to-agent handoff', () => {
    expect(buildClientStateScript()).toContain('pendingAgentDraft: null')
  })

  it('reads the same localStorage keys the Agent view uses', () => {
    const script = buildClientStateScript()
    expect(script).toContain("localStorage.getItem('codemind_api_key')")
    expect(script).toContain("localStorage.getItem('codemind_mode')")
  })

  it('exposes a shared HTML-escaping helper for views rendering untrusted content', () => {
    expect(buildClientStateScript()).toContain('function appEscapeHtml(value)')
  })
})
