import { describe, expect, it } from 'vitest'

import { isPrivateOrInternalHost, isSafeUrlScheme } from './web-safety.js'

describe('isSafeUrlScheme', () => {
  it('allows http and https', () => {
    expect(isSafeUrlScheme(new URL('http://example.com'))).toBe(true)
    expect(isSafeUrlScheme(new URL('https://example.com'))).toBe(true)
  })

  it('rejects file, ftp, data, and javascript schemes', () => {
    expect(isSafeUrlScheme(new URL('file:///etc/passwd'))).toBe(false)
    expect(isSafeUrlScheme(new URL('ftp://example.com/file'))).toBe(false)
    expect(isSafeUrlScheme(new URL('data:text/plain;base64,aGVsbG8='))).toBe(false)
    expect(isSafeUrlScheme(new URL('javascript:alert(1)'))).toBe(false)
  })
})

describe('isPrivateOrInternalHost', () => {
  it('flags localhost', () => {
    expect(isPrivateOrInternalHost('localhost')).toBe(true)
    expect(isPrivateOrInternalHost('LOCALHOST')).toBe(true)
    expect(isPrivateOrInternalHost('foo.localhost')).toBe(true)
  })

  it('flags loopback and unspecified addresses', () => {
    expect(isPrivateOrInternalHost('127.0.0.1')).toBe(true)
    expect(isPrivateOrInternalHost('127.5.5.5')).toBe(true)
    expect(isPrivateOrInternalHost('0.0.0.0')).toBe(true)
    expect(isPrivateOrInternalHost('::1')).toBe(true)
  })

  it('flags link-local addresses including the cloud metadata endpoint', () => {
    expect(isPrivateOrInternalHost('169.254.169.254')).toBe(true)
    expect(isPrivateOrInternalHost('169.254.1.1')).toBe(true)
    expect(isPrivateOrInternalHost('fe80::1')).toBe(true)
  })

  it('flags RFC1918 private ranges', () => {
    expect(isPrivateOrInternalHost('10.0.0.1')).toBe(true)
    expect(isPrivateOrInternalHost('10.255.255.255')).toBe(true)
    expect(isPrivateOrInternalHost('172.16.0.1')).toBe(true)
    expect(isPrivateOrInternalHost('172.31.255.255')).toBe(true)
    expect(isPrivateOrInternalHost('192.168.1.1')).toBe(true)
  })

  it('does not flag adjacent public ranges', () => {
    expect(isPrivateOrInternalHost('172.15.255.255')).toBe(false)
    expect(isPrivateOrInternalHost('172.32.0.0')).toBe(false)
    expect(isPrivateOrInternalHost('11.0.0.1')).toBe(false)
    expect(isPrivateOrInternalHost('193.168.1.1')).toBe(false)
  })

  it('does not flag ordinary public hostnames', () => {
    expect(isPrivateOrInternalHost('example.com')).toBe(false)
    expect(isPrivateOrInternalHost('docs.npmjs.com')).toBe(false)
    expect(isPrivateOrInternalHost('8.8.8.8')).toBe(false)
  })

  it('flags IPv6 unique local addresses', () => {
    expect(isPrivateOrInternalHost('fc00::1')).toBe(true)
    expect(isPrivateOrInternalHost('fd12:3456::1')).toBe(true)
  })
})
