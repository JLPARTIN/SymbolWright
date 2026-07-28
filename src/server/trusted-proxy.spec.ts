import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'

import {
  normalizeIpAddress,
  parseTrustedProxyCidrs,
  resolveRequestSecurity,
  TrustedProxyConfigError,
} from './trusted-proxy.js'

function request(
  remoteAddress: string,
  headers: Record<string, string> = {},
  encrypted = false,
): IncomingMessage {
  const socket = Object.assign(new EventEmitter(), { remoteAddress, encrypted })
  return { socket, headers } as unknown as IncomingMessage
}

describe('trusted proxy resolution', () => {
  it('normalizes IPv4-mapped IPv6 addresses before CIDR matching', () => {
    expect(normalizeIpAddress('::ffff:127.0.0.1')).toBe('127.0.0.1')
    const result = resolveRequestSecurity(
      request('::ffff:127.0.0.1', {
        'x-forwarded-for': '203.0.113.8',
        'x-forwarded-proto': 'https',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['127.0.0.0/8']),
      },
    )
    expect(result.rejection).toBeUndefined()
    expect(result.clientIp).toBe('203.0.113.8')
  })

  it('ignores spoofed forwarded headers from an untrusted peer by rejecting the peer', () => {
    const result = resolveRequestSecurity(
      request('203.0.113.99', {
        'x-forwarded-for': '10.0.0.1',
        'x-forwarded-proto': 'https',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['127.0.0.0/8']),
      },
    )
    expect(result.rejection?.code).toBe('untrusted_proxy_peer')
  })

  it('selects the first untrusted hop while walking XFF right-to-left', () => {
    const result = resolveRequestSecurity(
      request('10.0.0.5', {
        'x-forwarded-for': '198.51.100.7, 10.0.0.4',
        'x-forwarded-proto': 'https',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['10.0.0.0/8']),
      },
    )
    expect(result.clientIp).toBe('198.51.100.7')
  })

  it('uses the rightmost proxy-owned protocol value, not any https substring', () => {
    const result = resolveRequestSecurity(
      request('10.0.0.5', {
        forwarded: 'for=client;proto=https, for=proxy;proto=http',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['10.0.0.0/8']),
      },
    )
    expect(result.rejection?.code).toBe('forwarded_protocol_invalid')
  })

  it('rejects disagreement between Forwarded and X-Forwarded-Proto', () => {
    const result = resolveRequestSecurity(
      request('10.0.0.5', {
        forwarded: 'for=proxy;proto=https',
        'x-forwarded-proto': 'http, http',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['10.0.0.0/8']),
      },
    )
    expect(result.rejection?.code).toBe('forwarded_protocol_conflict')
  })

  it('fails startup parsing on malformed CIDRs', () => {
    expect(() => parseTrustedProxyCidrs(['10.0.0.0/99'])).toThrow(TrustedProxyConfigError)
    expect(() => parseTrustedProxyCidrs(['not-an-ip'])).toThrow(TrustedProxyConfigError)
  })
})
