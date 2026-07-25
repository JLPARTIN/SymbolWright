import { describe, expect, it } from 'vitest'

import { checkClientConstraints } from './client-constraints-match.js'

describe('checkClientConstraints', () => {
  it('allows anything when constraints are absent', () => {
    expect(checkClientConstraints({}, undefined)).toBeUndefined()
  })

  it('allows anything when the constraint lists are empty', () => {
    expect(
      checkClientConstraints({ ip: '1.2.3.4' }, { allowedIpCidrs: [], allowedClientIds: [] }),
    ).toBeUndefined()
  })

  it('matches an exact IP with no CIDR suffix', () => {
    expect(
      checkClientConstraints({ ip: '203.0.113.9' }, { allowedIpCidrs: ['203.0.113.9'] }),
    ).toBeUndefined()
    expect(
      checkClientConstraints({ ip: '203.0.113.10' }, { allowedIpCidrs: ['203.0.113.9'] }),
    ).toBeDefined()
  })

  it('matches a CIDR range', () => {
    expect(
      checkClientConstraints({ ip: '10.0.0.42' }, { allowedIpCidrs: ['10.0.0.0/24'] }),
    ).toBeUndefined()
    expect(
      checkClientConstraints({ ip: '10.0.1.1' }, { allowedIpCidrs: ['10.0.0.0/24'] }),
    ).toBeDefined()
  })

  it('treats /0 as matching every IPv4 address', () => {
    expect(
      checkClientConstraints({ ip: '8.8.8.8' }, { allowedIpCidrs: ['0.0.0.0/0'] }),
    ).toBeUndefined()
  })

  it('rejects a missing IP when an allowlist is configured', () => {
    expect(checkClientConstraints({}, { allowedIpCidrs: ['10.0.0.0/8'] })).toBeDefined()
  })

  it('enforces allowedClientIds independently of IP', () => {
    expect(
      checkClientConstraints(
        { ip: '10.0.0.1', clientId: 'ci-runner-1' },
        { allowedClientIds: ['ci-runner-1'] },
      ),
    ).toBeUndefined()
    expect(
      checkClientConstraints(
        { ip: '10.0.0.1', clientId: 'unknown-client' },
        { allowedClientIds: ['ci-runner-1'] },
      ),
    ).toBeDefined()
  })

  it('requires both constraints to pass when both are configured', () => {
    const constraints = { allowedIpCidrs: ['10.0.0.0/24'], allowedClientIds: ['ci-runner-1'] }
    expect(
      checkClientConstraints({ ip: '10.0.0.5', clientId: 'ci-runner-1' }, constraints),
    ).toBeUndefined()
    expect(checkClientConstraints({ ip: '10.0.0.5', clientId: 'other' }, constraints)).toBeDefined()
  })
})
