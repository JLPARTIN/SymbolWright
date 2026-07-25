import { describe, expect, it } from 'vitest'

import {
  SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS,
  SYMBOLWRIGHT_PUBLIC_API_ROUTES,
  buildUniversalApiContractReport,
  validateExternalMissionRequest,
} from './universal-api-contract.js'
import {
  SYMBOLWRIGHT_PROVIDER_ADAPTERS,
  buildProviderAdapterContractReport,
} from '../providers/provider-adapter-contract.js'
import {
  SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS,
  assessBrowserWorkspaceReadiness,
  buildBrowserWorkspaceContract,
} from '../workspace/browser-workspace-contract.js'

describe('universal SymbolWright API contract', () => {
  it('declares the required public API routes', () => {
    const routeKeys = SYMBOLWRIGHT_PUBLIC_API_ROUTES.map((route) => `${route.method} ${route.path}`)

    expect(routeKeys).toContain('POST /api/missions')
    expect(routeKeys).toContain('POST /api/chat')
    expect(routeKeys).toContain('POST /api/tools/run')
    expect(routeKeys).toContain('POST /api/providers/test')
    expect(routeKeys).toContain('GET /api/sessions/:id')
    expect(routeKeys).toContain('GET /api/missions/:id/events')
  })

  it('requires SymbolWright API auth and blocks browser-side provider material', () => {
    for (const route of SYMBOLWRIGHT_PUBLIC_API_ROUTES) {
      expect(route.requiresSymbolWrightApiKey).toBe(true)
      expect(route.browserMaySendRawProviderKey).toBe(false)
      expect(route.allowedClients).toEqual(SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS)
      expect(route.allowedProviders.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('passes the universal API contract report', () => {
    const report = buildUniversalApiContractReport()

    expect(report.status).toBe('READY')
    expect(report.findings).toEqual([])
    expect(report.routeCount).toBe(SYMBOLWRIGHT_PUBLIC_API_ROUTES.length)
  })

  it('normalizes supported provider adapters behind the SymbolWright server boundary', () => {
    const report = buildProviderAdapterContractReport()

    expect(report.status).toBe('READY')
    expect(report.providerCount).toBe(SYMBOLWRIGHT_PROVIDER_ADAPTERS.length)
    expect(SYMBOLWRIGHT_PROVIDER_ADAPTERS.map((provider) => provider.id)).toEqual([
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
    expect(SYMBOLWRIGHT_PROVIDER_ADAPTERS.every((provider) => provider.browserSafe === false)).toBe(
      true,
    )
    expect(
      SYMBOLWRIGHT_PROVIDER_ADAPTERS.every(
        (provider) => provider.endpointOwnership === 'symbolwright_server',
      ),
    ).toBe(true)
  })

  it('validates external mission requests from any supported LLM client', () => {
    const validation = validateExternalMissionRequest({
      client: 'chatgpt',
      provider: 'openai',
      repo: 'JLPARTIN/SymbolWright',
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

    expect(contract.entrypoint).toBe('/symbolwright')
    expect(contract.browserStoresProviderKeys).toBe(false)
    expect(contract.panels).toEqual(SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS)
  })

  it('passes browser workspace readiness', () => {
    const report = assessBrowserWorkspaceReadiness()

    expect(report.status).toBe('READY')
    expect(report.findings).toEqual([])
  })
})
