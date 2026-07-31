import { describe, expect, it } from 'vitest'

import { buildDashboardClientScript, renderDashboardViewHtml } from './dashboard-view.js'

describe('renderDashboardViewHtml', () => {
  it('renders a sandbox network status placeholder section', () => {
    const html = renderDashboardViewHtml()
    expect(html).toContain('id="dashboard-sandbox-network"')
  })
})

describe('buildDashboardClientScript', () => {
  it('fetches the operator-only sandbox network control-plane route', () => {
    const script = buildDashboardClientScript()
    expect(script).toContain('/api/sandbox/network-status')
  })

  it('handles a 404 (non-operator caller) without treating it as an error', () => {
    const script = buildDashboardClientScript()
    const fnBody = script.slice(
      script.indexOf('async function loadSandboxNetworkStatus'),
      script.indexOf('registerRouterViewInit'),
    )
    expect(fnBody).toContain('response.status === 404')
    expect(fnBody).toContain('operator')
  })

  it('renders dependency-layer-binding health, egress audit log size, and aggregate concurrency', () => {
    const script = buildDashboardClientScript()
    const fnBody = script.slice(
      script.indexOf('async function loadSandboxNetworkStatus'),
      script.indexOf('registerRouterViewInit'),
    )
    expect(fnBody).toContain('data.dependencyLayerBindings')
    expect(fnBody).toContain('data.egressAuditLog')
    expect(fnBody).toContain('data.aggregateConcurrency')
  })

  it('registers the original loadDashboardStatus as the dashboard view initializer, which also loads sandbox network status', () => {
    const script = buildDashboardClientScript()
    expect(script).toContain("registerRouterViewInit('dashboard', loadDashboardStatus)")

    const dashboardFnBody = script.slice(
      script.indexOf('async function loadDashboardStatus'),
      script.indexOf('async function loadSandboxNetworkStatus'),
    )
    expect(dashboardFnBody).toContain('loadSandboxNetworkStatus()')
  })
})
