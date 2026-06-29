import { describe, expect, it } from 'vitest'

import type { AelibConnectorStatus } from '../aelib/aelib-connector.js'
import type { WorkspaceState } from '../cli-workspace.js'
import {
  buildWorkspaceWebSnapshot,
  renderAelibWebResponse,
  renderWorkspaceWebHtml,
  renderWorkspaceWebResponse,
} from './workspace-web-app.js'

const WORKSPACE: WorkspaceState = {
  cwd: '/workspace/project',
  primaryName: 'project',
  primaryPath: '/workspace/project',
  repos: [{ displayName: 'project', rootPath: '/workspace/project' }],
  repoCount: 1,
}

const AELIB_STATUS: AelibConnectorStatus = {
  connectorId: 'AELIB-X1YA0I',
  state: 'NOT_CONFIGURED',
  tokenState: 'missing',
  detail: 'Set CODEMIND_AELIB_ENDPOINT to enable the AELIB-X1YA0I connector health check.',
  checkedAt: '2026-06-29T00:00:00.000Z',
}

describe('workspace web app', () => {
  it('renders a browser page backed by local API endpoints', () => {
    const html = renderWorkspaceWebHtml()

    expect(html).toContain('CodeMind Workspace')
    expect(html).toContain('/api/health')
    expect(html).toContain('/api/providers')
    expect(html).toContain('/api/aelib')
    expect(html).toContain('AELIB-X1YA0I')
    expect(html).toContain('health.workspace.primary.displayName')
    expect(html).toContain('no provider invocation')
    expect(html).not.toContain('AELIB connected')
  })

  it('builds a real provider snapshot with redacted provider state', () => {
    const snapshot = buildWorkspaceWebSnapshot(WORKSPACE)

    expect(snapshot.app.liveLocalApi).toBe(true)
    expect(snapshot.workspace.primaryPath).toBe('/workspace/project')
    expect(snapshot.boundary.mutatesFiles).toBe(false)
    expect(snapshot.boundary.executesShell).toBe(false)
    expect(snapshot.boundary.invokesProvider).toBe(false)
    expect(snapshot.boundary.externalApiCalls).toBe(false)
    expect(snapshot.boundary.fakeConnectedState).toBe(false)
    expect(snapshot.providers.statuses.length).toBeGreaterThan(0)
    expect(snapshot.providers.redactedConfig.providers.length).toBeGreaterThan(0)
    expect(
      snapshot.providers.redactedConfig.providers.every(
        (provider) => provider.apiKey === 'configured' || provider.apiKey === 'missing',
      ),
    ).toBe(true)
  })

  it('renders health, provider, and AELIB API responses', async () => {
    const snapshot = buildWorkspaceWebSnapshot(WORKSPACE)
    const health = renderWorkspaceWebResponse('/api/health', () => snapshot)
    const providers = renderWorkspaceWebResponse('/api/providers', () => snapshot)
    const aelib = await renderAelibWebResponse(async () => AELIB_STATUS)

    const healthBody = JSON.parse(health.body) as {
      readonly workspace: {
        readonly primaryName: string
        readonly primaryPath: string
        readonly primary: { readonly displayName: string; readonly rootPath: string }
      }
    }

    expect(health.statusCode).toBe(200)
    expect(health.contentType).toContain('application/json')
    expect(healthBody.workspace.primaryName).toBe('project')
    expect(healthBody.workspace.primaryPath).toBe('/workspace/project')
    expect(healthBody.workspace.primary.displayName).toBe('project')
    expect(healthBody.workspace.primary.rootPath).toBe('/workspace/project')

    expect(providers.statusCode).toBe(200)
    expect(providers.contentType).toContain('application/json')
    expect(JSON.parse(providers.body).statuses.length).toBeGreaterThan(0)

    expect(aelib.statusCode).toBe(200)
    expect(aelib.contentType).toContain('application/json')
    expect(JSON.parse(aelib.body).state).toBe('NOT_CONFIGURED')
  })

  it('returns 404 for unknown routes', () => {
    const response = renderWorkspaceWebResponse('/missing', () =>
      buildWorkspaceWebSnapshot(WORKSPACE),
    )

    expect(response.statusCode).toBe(404)
    expect(response.body).toContain('Not found')
  })
})
