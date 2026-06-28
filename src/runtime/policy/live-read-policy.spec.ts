import { describe, expect, it } from 'vitest'

import {
  evaluateLiveReadPolicy,
  liveReadBoundary,
  type LiveReadPolicyRequest,
} from './live-read-policy.js'

function allowedRequest(overrides: Partial<LiveReadPolicyRequest> = {}): LiveReadPolicyRequest {
  return {
    provider: 'github',
    purpose: 'review pull request evidence',
    scopes: ['pr:read', 'checks:read', 'contents:read'],
    dryRun: true,
    ...overrides,
  }
}

describe('evaluateLiveReadPolicy', () => {
  it('allows a valid dry-run request with allowed scopes', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest())

    expect(decision.allowed).toBe(true)
    expect(decision.reason).toContain('accepted')
    expect(decision.requestedScopes).toEqual(['pr:read', 'checks:read', 'contents:read'])
  })

  it('blocks unsupported provider', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ provider: 'gitlab' as never }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('unsupported provider')
  })

  it('blocks when dryRun is false', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ dryRun: false }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('dryRun=true')
  })

  it('blocks when purpose is empty', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ purpose: '' }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('purpose is required')
  })

  it('blocks when purpose is whitespace only', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ purpose: '   ' }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('purpose is required')
  })

  it('blocks disallowed write scopes', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ scopes: ['pr:read', 'pr:write'] }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('disallowed scopes')
    expect(decision.reason).toContain('pr:write')
  })

  it('blocks multiple disallowed scopes', () => {
    const decision = evaluateLiveReadPolicy(
      allowedRequest({ scopes: ['comments:write', 'merge', 'branch:push'] }),
    )

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('comments:write')
    expect(decision.reason).toContain('merge')
    expect(decision.reason).toContain('branch:push')
  })

  it('blocks actions:write scope', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ scopes: ['actions:write'] }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('actions:write')
  })

  it('blocks workflow:rerun scope', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ scopes: ['workflow:rerun'] }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('workflow:rerun')
  })

  it('blocks checks:write scope', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ scopes: ['checks:write'] }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('checks:write')
  })

  it('blocks contents:write scope', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ scopes: ['contents:write'] }))

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('contents:write')
  })

  it('allows a subset of allowed scopes', () => {
    const decision = evaluateLiveReadPolicy(allowedRequest({ scopes: ['pr:read'] }))

    expect(decision.allowed).toBe(true)
    expect(decision.requestedScopes).toEqual(['pr:read'])
  })

  it('always includes boundary in decisions', () => {
    const allow = evaluateLiveReadPolicy(allowedRequest())
    const block = evaluateLiveReadPolicy(allowedRequest({ dryRun: false }))

    expect(allow.requiredBoundary.length).toBeGreaterThan(0)
    expect(block.requiredBoundary.length).toBeGreaterThan(0)
  })
})

describe('liveReadBoundary', () => {
  it('includes all required boundary statements', () => {
    const boundary = liveReadBoundary()

    expect(boundary).toContain('read-only adapter handshake only')
    expect(boundary).toContain('no service call is performed')
    expect(boundary).toContain('no comments are posted')
    expect(boundary).toContain('no approvals are submitted')
    expect(boundary).toContain('no merges are performed')
    expect(boundary).toContain('no branches are pushed')
    expect(boundary).toContain('no workflow reruns are requested')
  })
})
