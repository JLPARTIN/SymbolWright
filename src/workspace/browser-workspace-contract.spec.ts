import { describe, expect, it } from 'vitest'

import {
  assessBrowserWorkspaceReadiness,
  buildBrowserWorkspaceContract,
  SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS,
  renderBrowserWorkspaceReadinessReport,
} from './browser-workspace-contract.js'

describe('browser workspace contract', () => {
  it('renders a ready contract without findings', () => {
    const report = assessBrowserWorkspaceReadiness()
    const rendered = renderBrowserWorkspaceReadinessReport(report)

    expect(report.status).toBe('READY')
    expect(report.findings).toEqual([])
    expect(rendered).toContain('Status: READY')
    expect(rendered).toContain('Findings: none')
  })

  it('reports every blocked browser-workspace boundary violation', () => {
    const contract = {
      ...buildBrowserWorkspaceContract(),
      panels: SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS.slice(0, -1),
      publicApiRouteCount: 0,
      providerCount: 0,
      browserStoresProviderKeys: true,
      keyBoundary: 'browser_to_provider_direct' as const,
    }
    const report = assessBrowserWorkspaceReadiness(contract)
    const rendered = renderBrowserWorkspaceReadinessReport(report)

    expect(report.status).toBe('BLOCKED')
    expect(report.findings.join('\n')).toContain('Missing browser workspace panel')
    expect(report.findings.join('\n')).toContain('complete public API route set')
    expect(report.findings.join('\n')).toContain('enough provider choices')
    expect(report.findings.join('\n')).toContain('must not persist provider key material')
    expect(report.findings.join('\n')).toContain('must route through SymbolWright')
    expect(rendered).toContain('Findings:')
    expect(rendered).toContain('browser_to_provider_direct')
  })
})
