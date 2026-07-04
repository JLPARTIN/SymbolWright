import { describe, expect, it } from 'vitest'

import {
  CODEMIND_EXTERNAL_CLIENT_KINDS,
  CODEMIND_PUBLIC_API_ROUTES,
  buildUniversalApiContractReport,
  validateExternalMissionRequest,
} from './universal-api-contract.js'
import {
  CODEMIND_PROVIDER_ADAPTERS,
  buildProviderAdapterContractReport,
} from '../providers/provider-adapter-contract.js'
import {
  CODEMIND_BROWSER_WORKSPACE_PANELS,
  assessBrowserWorkspaceReadiness,
  buildBrowserWorkspaceContract,
} from '../workspace/browser-workspace-contract.js'

describe('universal CodeMind API contract', () => {
  it('declares the required public API routes', () => {
    const routeKeys = CODEMIND_PUBLIC_API_ROUTES.map((route) => `${route.method} ${route.path}`)

    expect(routeKeys).toContain('POST /api/missions')
    expect(routeKeys).toContain('POST /api/chat')
    expect(routeKeys).toContain('POST /api/tools/run')
    expect(routeKeys).toContain('POST /api/providers/test')
    expect(routeKeys).toContain('GET /api/sessions/:id')
    expect(routeKeys).toContain('GET /api/missions/:id/events')
  })

  it('requires CodeMind API auth and blocks browser-side provider material', () => {
    for (const route of CODEMIND_PUBLIC_API_ROUTES) {
      expect(route.requiresCodemindApiKey).toBe(true)
      expect(route.browserMaySendRawProviderKey).toBe(false)
      expect(route.allowedClients).toEqual(CODEMIND_EXTERNAL_CLIENT_KINDS)
      expect(route.allowedProviders.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('passes the universal API contract report', () => {
    const report = buildUniversalApiContractReport()

    expect(report.status).toBe('READY')
    expect(report.findings).toEqual([])
    expect(report.routeCount).toBe(CODEMIND_PUBLIC_API_ROUTES.length)
  })

  it('normalizes supported provider adapters behind the CodeMind server boundary', () => {
    const report = buildProviderAdapterContractReport()

    expect(report.status).toBe('READY')
    expect(report.providerCount).toBe(CODEMIND_PROVIDER_ADAPTERS.length)
    expect(CODEMIND_PROVIDER_ADAPTERS.map((provider) => provider.id)).toEqual([
      'openai',
      'anthropic',
      'google-gemini',
      'groq',
      'openrouter',
      'github-models',
      'ollama',
      'deepseek',
      'custom',
    ])
    expect(CODEMIND_PROVIDER_ADAPTERS.every((provider) => provider.browserSafe === false)).toBe(
      true,
    )
    expect(
      CODEMIND_PROVIDER_ADAPTERS.every(
        (provider) => provider.endpointOwnership === 'codemind_server',
      ),
    ).toBe(true)
  })

  it('validates external mission requests from any supported LLM client', () => {
    const validation = validateExternalMissionRequest({
      client: 'chatgpt',
      provider: 'openai',
      repo: 'JLPARTIN/CodeMind',
      mission: 'Run a forensic audit and prepare large PR bundles.',
      stream: true,
    })

    expect(validation.accepted).toBe(true)
    expect(validation.findings).toEqual([])
  })
})

describe('browser workspace contract', () => {
  it('declares every required workspace panel', () => {
    const contract = buildBrowserWorkspaceContract()

    expect(contract.entrypoint).toBe('/codemind')
    expect(contract.browserStoresProviderKeys).toBe(false)
    expect(contract.panels).toEqual(CODEMIND_BROWSER_WORKSPACE_PANELS)
  })

  it('passes browser workspace readiness', () => {
    const report = assessBrowserWorkspaceReadiness()

    expect(report.status).toBe('READY')
    expect(report.findings).toEqual([])
  })
})
