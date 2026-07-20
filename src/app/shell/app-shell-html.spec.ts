import { describe, expect, it } from 'vitest'

import { renderAppShellHtml } from './app-shell-html.js'

describe('renderAppShellHtml', () => {
  it('renders one document containing every view as a sibling data-view section', () => {
    const html = renderAppShellHtml()
    for (const viewId of [
      'dashboard',
      'missions',
      'workspace',
      'agent',
      'tools',
      'memory',
      'checkpoints',
      'settings',
      'repository',
    ]) {
      expect(html).toContain(`data-view="${viewId}"`)
    }
  })

  it('renders a persistent nav with a data-nav entry per primary view, including Missions and the real Repository tab', () => {
    const html = renderAppShellHtml()
    for (const viewId of [
      'dashboard',
      'missions',
      'workspace',
      'repository',
      'agent',
      'tools',
      'memory',
      'checkpoints',
      'settings',
    ]) {
      expect(html).toContain(`data-nav="${viewId}"`)
    }
  })

  it('wires the Repository view to the real repository API routes, not a placeholder', () => {
    const html = renderAppShellHtml()
    expect(html).toContain("registerRouterViewInit('repository'")
    expect(html).toContain('/api/repository/tree')
    expect(html).toContain('/api/repository/file')
    expect(html).toContain('/api/repository/push')
    expect(html).toContain('/api/repository/pull-request')
    expect(html).not.toContain('planned-badge')
  })

  it('boots the router once after all view scripts are inlined', () => {
    const html = renderAppShellHtml()
    expect(html.trim().endsWith('</html>')).toBe(true)
    const bootIndex = html.lastIndexOf('renderRoute();')
    const routerScriptIndex = html.indexOf('function registerRouterViewInit')
    expect(bootIndex).toBeGreaterThan(routerScriptIndex)
  })

  it('wraps the Workspace, Agent, and Missions client scripts in their own IIFE so their top-level declarations cannot collide', () => {
    const html = renderAppShellHtml()
    const iifeOpenCount = (html.match(/<script>\(function \(\) \{/g) ?? []).length
    // One IIFE each for workspace, agent/chat, and missions client scripts.
    expect(iifeOpenCount).toBe(3)
  })

  it('serves a single application shell document', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('<title>CodeMind</title>')
    expect(html.match(/<!doctype html>/gi)?.length).toBe(1)
  })

  it('wires the embedded workspace-to-agent handoff instead of only the separate-page draft link', () => {
    const html = renderAppShellHtml()
    // The fallback <a id="chat-draft-link"> markup is still present (workspace-client-script.ts
    // only uses it when window.codemindHandleWorkspaceDraft is undefined), but the shell defines
    // that hook, so the in-page handoff is what actually fires when a user clicks an AI task button.
    expect(html).toContain('window.codemindHandleWorkspaceDraft = function')
    expect(html).toContain("registerRouterViewInit('agent', applyPendingAgentDraftToAgentView)")
  })

  it('parses legacy ?draft=/&agentMode= URL params and switches to the agent view for backward compatibility', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('applyBackwardCompatDraftUrl')
    expect(html).toContain("params.get('draft')")
  })
})
