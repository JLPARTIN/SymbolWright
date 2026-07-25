import { describe, expect, it } from 'vitest'

import { buildWorkspaceAgentBridgeScript } from './workspace-agent-bridge.js'

describe('buildWorkspaceAgentBridgeScript', () => {
  it('defines window.symbolWrightHandleWorkspaceDraft, the hook workspace-client-script.ts calls', () => {
    expect(buildWorkspaceAgentBridgeScript()).toContain(
      'window.symbolWrightHandleWorkspaceDraft = function',
    )
  })

  it('stores the draft in appState and navigates to the agent view rather than opening a link', () => {
    const script = buildWorkspaceAgentBridgeScript()
    expect(script).toContain('appState.set({ pendingAgentDraft:')
    expect(script).toContain("navigateTo('agent')")
  })

  it('registers an agent-view init that applies the draft without auto-sending it', () => {
    const script = buildWorkspaceAgentBridgeScript()
    expect(script).toContain("registerRouterViewInit('agent', applyPendingAgentDraftToAgentView)")
    expect(script).not.toContain('sendMessage()')
    expect(script).toContain('Loaded from Workspace')
  })

  it('clears pendingAgentDraft only inside the branch that already applied it to the DOM', () => {
    const script = buildWorkspaceAgentBridgeScript()
    const fnBody = script.slice(
      script.indexOf('function applyPendingAgentDraftToAgentView'),
      script.indexOf('registerRouterViewInit('),
    )
    expect(fnBody).toContain('if (!appState.pendingAgentDraft) return;')
    expect(fnBody.indexOf('input.value = draft.message')).toBeLessThan(
      fnBody.indexOf('appState.set({ pendingAgentDraft: null })'),
    )
  })

  it('parses the legacy ?draft=/&agentMode= URL params and switches to the agent view for backward compatibility', () => {
    const script = buildWorkspaceAgentBridgeScript()
    expect(script).toContain("params.get('draft')")
    expect(script).toContain("params.get('agentMode')")
    expect(script).toContain('applyBackwardCompatDraftUrl')
  })
})
