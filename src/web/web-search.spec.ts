import { describe, expect, it } from 'vitest'

import { RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimePolicySnapshot } from '../runtime/types.js'
import { DEFAULT_WEB_CONFIG, mergeWebConfig } from './web-config.js'
import type {
  WebSearchProvider,
  WebSearchProviderRequest,
  WebSearchProviderResult,
} from './web-search-provider.js'
import { performWebSearch } from './web-search.js'

const ALLOWING_RUNTIME_POLICY = createRuntimePolicyForMode('READ_ONLY')

class FakeSearchProvider implements WebSearchProvider {
  readonly name = 'fake'
  public lastRequest: WebSearchProviderRequest | undefined

  constructor(private readonly result: WebSearchProviderResult) {}

  async search(request: WebSearchProviderRequest): Promise<WebSearchProviderResult> {
    this.lastRequest = request
    return this.result
  }
}

describe('performWebSearch', () => {
  it('returns results with evidence and an audit trace on success', async () => {
    const provider = new FakeSearchProvider({
      outcome: 'ok',
      results: [{ title: 'Vitest', url: 'https://vitest.dev', snippet: 'A fast test runner.' }],
    })
    const auditLog = new RuntimeAuditLog()

    const evidence = await performWebSearch({
      query: 'vitest',
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
      auditLog,
    })

    expect(evidence.status).toBe('ok')
    expect(evidence.provider).toBe('fake')
    expect(evidence.results).toHaveLength(1)
    expect(evidence.auditTrace).toHaveLength(1)
    expect(evidence.auditTrace[0]?.status).toBe('allowed')
    expect(auditLog.list()).toHaveLength(1)
    expect(provider.lastRequest?.query).toBe('vitest')
    expect(provider.lastRequest?.maxResults).toBe(DEFAULT_WEB_CONFIG.search.maxResults)
  })

  it('redacts secrets in titles and snippets before evidence output', async () => {
    const provider = new FakeSearchProvider({
      outcome: 'ok',
      results: [
        {
          title: 'leaked api_key: super-secret-value',
          url: 'https://example.com',
          snippet: 'plain text',
        },
      ],
    })

    const evidence = await performWebSearch({
      query: 'q',
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
    })

    expect(evidence.results[0]?.title).toContain('[REDACTED]')
  })

  it('blocks empty queries without calling the provider', async () => {
    const provider = new FakeSearchProvider({ outcome: 'ok', results: [] })

    const evidence = await performWebSearch({
      query: '   ',
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
    })

    expect(evidence.status).toBe('blocked')
    expect(provider.lastRequest).toBeUndefined()
  })

  it('blocks when web.search.enabled is false', async () => {
    const provider = new FakeSearchProvider({ outcome: 'ok', results: [] })
    const config = mergeWebConfig({ search: { enabled: false } })

    const evidence = await performWebSearch({
      query: 'q',
      webConfig: config,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
    })

    expect(evidence.status).toBe('blocked')
    expect(provider.lastRequest).toBeUndefined()
  })

  it('blocks when the coarse runtime policy denies read-only network', async () => {
    const provider = new FakeSearchProvider({ outcome: 'ok', results: [] })
    const denyingPolicy: RuntimePolicySnapshot = {
      ...ALLOWING_RUNTIME_POLICY,
      allowReadOnlyNetwork: false,
    }

    const evidence = await performWebSearch({
      query: 'q',
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: denyingPolicy,
      provider,
    })

    expect(evidence.status).toBe('blocked')
    expect(provider.lastRequest).toBeUndefined()
  })

  it('surfaces provider transport errors without throwing', async () => {
    const provider = new FakeSearchProvider({
      outcome: 'transport_error',
      results: [],
      reason: 'DNS failure',
    })

    const evidence = await performWebSearch({
      query: 'q',
      webConfig: DEFAULT_WEB_CONFIG,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
    })

    expect(evidence.status).toBe('transport_error')
    expect(evidence.reason).toBe('DNS failure')
  })

  it('requires a web:access approval ticket in ask mode', async () => {
    const provider = new FakeSearchProvider({ outcome: 'ok', results: [] })
    const config = mergeWebConfig({ mode: 'ask' })

    const blocked = await performWebSearch({
      query: 'q',
      webConfig: config,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
    })
    expect(blocked.status).toBe('blocked')

    const allowed = await performWebSearch({
      query: 'q',
      webConfig: config,
      runtimePolicy: ALLOWING_RUNTIME_POLICY,
      provider,
      approval: { ticketId: 't1', approvedBy: 'operator', scopes: ['web:access'] },
    })
    expect(allowed.status).toBe('ok')
  })
})
