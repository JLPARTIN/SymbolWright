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

  it('uses canonical Codetelligence localStorage keys', () => {
    const script = buildClientStateScript()
    expect(script).toContain("'codetelligence_api_key'")
    expect(script).toContain("'codetelligence_mode'")
    expect(script).toContain("'codetelligence_active_mission_id'")
  })

  it('imports legacy CodeMind localStorage values for compatibility', () => {
    const script = buildClientStateScript()
    expect(script).toContain("'codemind_api_key'")
    expect(script).toContain("'codemind_mode'")
    expect(script).toContain("'codemind_active_mission_id'")
    expect(script).toContain('localStorage.setItem(canonicalKey, legacyValue)')
  })

  it('keeps the legacy appState key synchronized with the canonical key', () => {
    const script = buildClientStateScript()
    expect(script).toContain('codetelligenceKey: initialCodetelligenceKey')
    expect(script).toContain('codemindKey: initialCodetelligenceKey')
    expect(script).toContain('patch.codemindKey = patch.codetelligenceKey')
  })

  it('exposes a shared HTML-escaping helper for views rendering untrusted content', () => {
    expect(buildClientStateScript()).toContain('function appEscapeHtml(value)')
  })
})
