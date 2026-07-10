import { describe, expect, it } from 'vitest'

import { renderAppShellHtml } from './app-shell-html.js'

describe('renderAppShellHtml', () => {
  it('renders one document containing every view as a sibling data-view section', () => {
    const html = renderAppShellHtml()
    for (const viewId of [
      'dashboard',
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

  it('renders a persistent nav with a data-nav entry per primary view', () => {
    const html = renderAppShellHtml()
    for (const viewId of [
      'dashboard',
      'workspace',
      'agent',
      'tools',
      'memory',
      'checkpoints',
      'settings',
    ]) {
      expect(html).toContain(`data-nav="${viewId}"`)
    }
  })

  it('labels the repository placeholder as planned rather than a working control', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('planned-badge')
    expect(html).toContain('Large PR Bundle 2')
  })

  it('boots the router once after all view scripts are inlined', () => {
    const html = renderAppShellHtml()
    expect(html.trim().endsWith('</html>')).toBe(true)
    const bootIndex = html.lastIndexOf('renderRoute();')
    const routerScriptIndex = html.indexOf('function registerRouterViewInit')
    expect(bootIndex).toBeGreaterThan(routerScriptIndex)
  })

  it('wraps the Workspace and Agent client scripts in their own IIFE so their top-level const state/el declarations cannot collide', () => {
    const html = renderAppShellHtml()
    const iifeOpenCount = (html.match(/<script>\(function \(\) \{/g) ?? []).length
    // One IIFE for the workspace client script, one for the agent (chat) client script.
    expect(iifeOpenCount).toBe(2)
  })

  it('serves a single application shell document', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('<title>CodeMind</title>')
    expect(html.match(/<!doctype html>/gi)?.length).toBe(1)
  })
})
