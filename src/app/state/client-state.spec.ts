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
    expect(script).toContain(
      "appReadMigratedStorageItem('symbolwright_api_key', 'codemind_api_key')",
    )
    expect(script).toContain("appReadMigratedStorageItem('symbolwright_mode', 'codemind_mode')")
  })

  it('migrates a legacy codemind_api_key value forward to symbolwright_api_key without deleting it', () => {
    const script = buildClientStateScript()
    expect(script).toContain('function appReadMigratedStorageItem(canonicalKey, legacyKey)')
    expect(script).toContain('localStorage.setItem(canonicalKey, legacyValue)')
    expect(script).not.toContain('localStorage.removeItem(legacyKey)')
  })

  it('exposes a shared HTML-escaping helper for views rendering untrusted content', () => {
    expect(buildClientStateScript()).toContain('function appEscapeHtml(value)')
  })
})
