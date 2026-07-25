import { describe, expect, it, vi } from 'vitest'

import type { StartedUnifiedServer } from './app/server/route-types.js'
import { parseServeArgs, renderServeBanner, resolveChatServerOptions } from './cli-serve.js'
import {
  ChatServerConfigError,
  assertChatServerCanStart,
} from './server/symbolwright-chat-server.js'

describe('parseServeArgs', () => {
  it('returns no overrides when no flags are given', () => {
    expect(parseServeArgs([])).toEqual({})
  })

  it('parses --host, --port, and --cors-origin', () => {
    expect(
      parseServeArgs(['--host', '0.0.0.0', '--port', '9000', '--cors-origin', 'https://x.dev']),
    ).toEqual({
      host: '0.0.0.0',
      port: 9000,
      corsOrigin: 'https://x.dev',
    })
  })

  it('parses --flag=value form', () => {
    expect(parseServeArgs(['--host=0.0.0.0', '--port=9000'])).toEqual({
      host: '0.0.0.0',
      port: 9000,
    })
  })

  it('rejects an invalid port', () => {
    expect(() => parseServeArgs(['--port', 'abc'])).toThrow('Invalid port')
    expect(() => parseServeArgs(['--port', '99999'])).toThrow('Invalid port')
  })

  it('rejects unknown flags', () => {
    expect(() => parseServeArgs(['--bogus'])).toThrow('Unknown serve flag')
  })
})

describe('resolveChatServerOptions', () => {
  it('falls back to defaults when no env or args are given', () => {
    const options = resolveChatServerOptions({}, { SYMBOLWRIGHT_API_KEY: 'k' })
    expect(options).toEqual({ apiKey: 'k', host: '127.0.0.1', port: 8787 })
  })

  it('prefers CLI args over env vars', () => {
    const options = resolveChatServerOptions(
      { host: '0.0.0.0', port: 1234 },
      {
        SYMBOLWRIGHT_API_KEY: 'k',
        SYMBOLWRIGHT_CHAT_HOST: '10.0.0.1',
        SYMBOLWRIGHT_CHAT_PORT: '9999',
      },
    )
    expect(options.host).toBe('0.0.0.0')
    expect(options.port).toBe(1234)
  })

  it('reads TLS file paths and cors origin from env', () => {
    const options = resolveChatServerOptions(
      {},
      {
        SYMBOLWRIGHT_API_KEY: 'k',
        SYMBOLWRIGHT_CORS_ORIGIN: 'https://x.dev',
        SYMBOLWRIGHT_TLS_CERT_FILE: '/etc/tls/cert.pem',
        SYMBOLWRIGHT_TLS_KEY_FILE: '/etc/tls/key.pem',
      },
    )
    expect(options.corsOrigin).toBe('https://x.dev')
    expect(options.tlsCertFile).toBe('/etc/tls/cert.pem')
    expect(options.tlsKeyFile).toBe('/etc/tls/key.pem')
  })

  it('produces an empty api key when neither SYMBOLWRIGHT_API_KEY nor SYMBOLWRIGHT_API_KEY is set, which fails fast to start', () => {
    const options = resolveChatServerOptions({}, {})
    expect(options.apiKey).toBe('')
    expect(() => assertChatServerCanStart(options)).toThrow(ChatServerConfigError)
  })

  it('reads the canonical SYMBOLWRIGHT_API_KEY when only it is set', () => {
    const options = resolveChatServerOptions({}, { SYMBOLWRIGHT_API_KEY: 'sw-key' })
    expect(options.apiKey).toBe('sw-key')
  })

  it('falls back to legacy CODEMIND_API_KEY when the canonical var is unset', () => {
    const options = resolveChatServerOptions({}, { CODEMIND_API_KEY: 'legacy-key' })
    expect(options.apiKey).toBe('legacy-key')
  })

  it('prefers the canonical SYMBOLWRIGHT_API_KEY when both are set to the same value', () => {
    const options = resolveChatServerOptions(
      {},
      { SYMBOLWRIGHT_API_KEY: 'same-key', CODEMIND_API_KEY: 'same-key' },
    )
    expect(options.apiKey).toBe('same-key')
  })

  it('prefers the canonical SYMBOLWRIGHT_API_KEY and does not leak either value when they conflict', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const options = resolveChatServerOptions(
      {},
      { SYMBOLWRIGHT_API_KEY: 'new-key', CODEMIND_API_KEY: 'old-key' },
    )
    expect(options.apiKey).toBe('new-key')
    expect(spy).toHaveBeenCalledTimes(1)
    const message = String(spy.mock.calls[0]?.[0])
    expect(message).not.toContain('new-key')
    expect(message).not.toContain('old-key')
    spy.mockRestore()
  })

  it('reads canonical SYMBOLWRIGHT_* host/port/cors/TLS vars', () => {
    const options = resolveChatServerOptions(
      {},
      {
        SYMBOLWRIGHT_API_KEY: 'k',
        SYMBOLWRIGHT_CHAT_HOST: '10.0.0.2',
        SYMBOLWRIGHT_CHAT_PORT: '4321',
        SYMBOLWRIGHT_CORS_ORIGIN: 'https://sw.dev',
        SYMBOLWRIGHT_TLS_CERT_FILE: '/etc/sw/cert.pem',
        SYMBOLWRIGHT_TLS_KEY_FILE: '/etc/sw/key.pem',
      },
    )
    expect(options.host).toBe('10.0.0.2')
    expect(options.port).toBe(4321)
    expect(options.corsOrigin).toBe('https://sw.dev')
    expect(options.tlsCertFile).toBe('/etc/sw/cert.pem')
    expect(options.tlsKeyFile).toBe('/etc/sw/key.pem')
  })
})

describe('renderServeBanner', () => {
  it('lists the served routes and the listening url', () => {
    const server: StartedUnifiedServer = {
      server: {} as StartedUnifiedServer['server'],
      url: 'http://127.0.0.1:8787',
      host: '127.0.0.1',
      port: 8787,
      warnings: [],
    }
    const banner = renderServeBanner(server)
    expect(banner).toContain('http://127.0.0.1:8787')
    expect(banner).toContain('/api/chat')
    expect(banner).not.toContain('Warnings:')
  })

  it('surfaces startup warnings', () => {
    const server: StartedUnifiedServer = {
      server: {} as StartedUnifiedServer['server'],
      url: 'http://0.0.0.0:8787',
      host: '0.0.0.0',
      port: 8787,
      warnings: ['reverse proxy recommended'],
    }
    expect(renderServeBanner(server)).toContain('reverse proxy recommended')
  })
})
