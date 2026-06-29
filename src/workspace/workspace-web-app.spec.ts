import { describe, expect, it } from 'vitest'

import type { WorkspaceState } from '../cli-workspace.js'
import {
  buildWorkspaceWebSnapshot,
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

describe('workspace web app', () => {
  it('renders a browser page backed by local API endpoints', () => {
    const html = renderWorkspaceWebHtml()

    expect(html).toContain('CodeMind Workspace')
    expect(html).toContain('/api/health')
    expect(html).toContain('/api/providers')
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

  it('renders health and provider API responses', () => {
    const snapshot = buildWorkspaceWebSnapshot(WORKSPACE)
    const health = renderWorkspaceWebResponse('/api/health', () => snapshot)
    const providers = renderWorkspaceWebResponse('/api/providers', () => snapshot)

    expect(health.statusCode).toBe(200)
    expect(health.contentType).toContain('application/json')
    expect(JSON.parse(health.body).workspace.primaryPath).toBe('/workspace/project')

    expect(providers.statusCode).toBe(200)
    expect(providers.contentType).toContain('application/json')
    expect(JSON.parse(providers.body).statuses.length).toBeGreaterThan(0)
  })

  it('returns 404 for unknown routes', () => {
    const response = renderWorkspaceWebResponse('/missing', () =>
      buildWorkspaceWebSnapshot(WORKSPACE),
    )

    expect(response.statusCode).toBe(404)
    expect(response.body).toContain('Not found')
  })
})
