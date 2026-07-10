import { describe, expect, it } from 'vitest'

import {
  APP_SHELL_ROUTE_IDS,
  buildClientRouterScript,
  DEFAULT_APP_SHELL_ROUTE,
} from './client-router.js'

describe('buildClientRouterScript', () => {
  it('lists every app shell view id including the repository placeholder', () => {
    expect(APP_SHELL_ROUTE_IDS).toEqual([
      'dashboard',
      'workspace',
      'agent',
      'tools',
      'memory',
      'checkpoints',
      'settings',
      'repository',
    ])
  })

  it('defaults to the dashboard route', () => {
    expect(DEFAULT_APP_SHELL_ROUTE).toBe('dashboard')
  })

  it('registers a hashchange listener', () => {
    expect(buildClientRouterScript()).toContain(
      "window.addEventListener('hashchange', renderRoute)",
    )
  })

  it('exposes navigateTo and registerRouterViewInit for views to use', () => {
    const script = buildClientRouterScript()
    expect(script).toContain('function navigateTo(viewId)')
    expect(script).toContain('function registerRouterViewInit(viewId, fn)')
  })

  it('toggles [data-view] visibility and [data-nav] active state by route id', () => {
    const script = buildClientRouterScript()
    expect(script).toContain("querySelectorAll('[data-view]')")
    expect(script).toContain("querySelectorAll('[data-nav]')")
  })
})
