import { describe, expect, it } from 'vitest'

import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'
import { DEFAULT_WEB_CONFIG, mergeWebConfig, type WebConfig } from './web-config.js'
import { evaluateWebFetchAccess, evaluateWebSearchAccess } from './web-policy.js'

const ALLOWING_RUNTIME_POLICY = createRuntimePolicyForMode('READ_ONLY') // allowReadOnlyNetwork is true everywhere
const DENYING_RUNTIME_POLICY: RuntimePolicySnapshot = {
  ...ALLOWING_RUNTIME_POLICY,
  allowReadOnlyNetwork: false,
}

function approvalWith(scopes: RuntimeApproval['scopes']): RuntimeApproval {
  return { ticketId: 't1', approvedBy: 'operator', scopes }
}

describe('evaluateWebFetchAccess', () => {
  it('allows an ordinary public URL under default developer-mode config', () => {
    const decision = evaluateWebFetchAccess(
      new URL('https://docs.npmjs.com/'),
      DEFAULT_WEB_CONFIG,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(true)
  })

  it('requires no approval ticket in developer mode', () => {
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      DEFAULT_WEB_CONFIG,
      ALLOWING_RUNTIME_POLICY,
      undefined,
    )
    expect(decision.allowed).toBe(true)
  })

  it('blocks unsafe schemes regardless of config', () => {
    const strictOffConfig = mergeWebConfig({ mode: 'off' })
    for (const url of [
      'file:///etc/passwd',
      'data:text/plain;base64,aGk=',
      'javascript:alert(1)',
    ]) {
      const decision = evaluateWebFetchAccess(
        new URL(url),
        DEFAULT_WEB_CONFIG,
        ALLOWING_RUNTIME_POLICY,
      )
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toMatch(/Unsafe URL scheme/)
      // Also blocked when mode=off, for the same hard-rail reason.
      expect(
        evaluateWebFetchAccess(new URL(url), strictOffConfig, ALLOWING_RUNTIME_POLICY).allowed,
      ).toBe(false)
    }
  })

  it('blocks everything when the coarse runtime policy denies read-only network', () => {
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      DEFAULT_WEB_CONFIG,
      DENYING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/disabled by runtime policy/)
  })

  it('blocks when web.mode is off', () => {
    const config = mergeWebConfig({ mode: 'off' })
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/web.mode=off/)
  })

  it('blocks private/internal hosts by default', () => {
    const decision = evaluateWebFetchAccess(
      new URL('http://localhost:3000'),
      DEFAULT_WEB_CONFIG,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/private\/internal address/)
  })

  it('allows private/internal hosts when allowPrivateNetwork is set', () => {
    const config = mergeWebConfig({ fetch: { allowPrivateNetwork: true } })
    const decision = evaluateWebFetchAccess(
      new URL('http://localhost:3000'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(true)
  })

  it('blocks cloud metadata even with allowPrivateNetwork unset', () => {
    const decision = evaluateWebFetchAccess(
      new URL('http://169.254.169.254/latest/meta-data/'),
      DEFAULT_WEB_CONFIG,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
  })

  it('requires a non-empty allowedDomains list in strict mode', () => {
    const config = mergeWebConfig({ mode: 'strict' })
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/strict.*allowedDomains/)
  })

  it('allows listed domains and subdomains in strict mode', () => {
    const config = mergeWebConfig({ mode: 'strict', fetch: { allowedDomains: ['example.com'] } })
    expect(
      evaluateWebFetchAccess(new URL('https://example.com/page'), config, ALLOWING_RUNTIME_POLICY)
        .allowed,
    ).toBe(true)
    expect(
      evaluateWebFetchAccess(
        new URL('https://docs.example.com/page'),
        config,
        ALLOWING_RUNTIME_POLICY,
      ).allowed,
    ).toBe(true)
  })

  it('blocks domains not on the allowlist', () => {
    const config = mergeWebConfig({ fetch: { allowedDomains: ['example.com'] } })
    const decision = evaluateWebFetchAccess(
      new URL('https://evil.example.org'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/not in web.fetch.allowedDomains/)
  })

  it('blocks denied domains even in developer mode', () => {
    const config = mergeWebConfig({ fetch: { deniedDomains: ['evil.example.org'] } })
    const decision = evaluateWebFetchAccess(
      new URL('https://evil.example.org'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/deniedDomains/)
  })

  it('blocks in ask mode without a web:access approval ticket', () => {
    const config = mergeWebConfig({ mode: 'ask' })
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/web.mode=ask requires/)
  })

  it('allows in ask mode with a web:access approval ticket', () => {
    const config = mergeWebConfig({ mode: 'ask' })
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      config,
      ALLOWING_RUNTIME_POLICY,
      approvalWith(['web:access']),
    )
    expect(decision.allowed).toBe(true)
  })

  it('does not accept an unrelated approval scope for ask mode', () => {
    const config = mergeWebConfig({ mode: 'ask' })
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      config,
      ALLOWING_RUNTIME_POLICY,
      approvalWith(['shell:execute']),
    )
    expect(decision.allowed).toBe(false)
  })

  it('blocks when web.fetch.enabled is false even if web.enabled is true', () => {
    const config: WebConfig = {
      ...DEFAULT_WEB_CONFIG,
      fetch: { ...DEFAULT_WEB_CONFIG.fetch, enabled: false },
    }
    const decision = evaluateWebFetchAccess(
      new URL('https://example.com'),
      config,
      ALLOWING_RUNTIME_POLICY,
    )
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/web.fetch.enabled/)
  })
})

describe('evaluateWebSearchAccess', () => {
  it('allows search under default developer-mode config', () => {
    expect(evaluateWebSearchAccess(DEFAULT_WEB_CONFIG, ALLOWING_RUNTIME_POLICY).allowed).toBe(true)
  })

  it('blocks search when web.search.enabled is false but leaves fetch unaffected', () => {
    const config = mergeWebConfig({ search: { enabled: false } })
    expect(evaluateWebSearchAccess(config, ALLOWING_RUNTIME_POLICY).allowed).toBe(false)
    expect(
      evaluateWebFetchAccess(new URL('https://example.com'), config, ALLOWING_RUNTIME_POLICY)
        .allowed,
    ).toBe(true)
  })

  it('blocks when web.mode is off', () => {
    const config = mergeWebConfig({ mode: 'off' })
    expect(evaluateWebSearchAccess(config, ALLOWING_RUNTIME_POLICY).allowed).toBe(false)
  })

  it('blocks when the coarse runtime policy denies read-only network', () => {
    expect(evaluateWebSearchAccess(DEFAULT_WEB_CONFIG, DENYING_RUNTIME_POLICY).allowed).toBe(false)
  })

  it('requires a web:access approval ticket in ask mode', () => {
    const config = mergeWebConfig({ mode: 'ask' })
    expect(evaluateWebSearchAccess(config, ALLOWING_RUNTIME_POLICY).allowed).toBe(false)
    expect(
      evaluateWebSearchAccess(config, ALLOWING_RUNTIME_POLICY, approvalWith(['web:access']))
        .allowed,
    ).toBe(true)
  })
})
