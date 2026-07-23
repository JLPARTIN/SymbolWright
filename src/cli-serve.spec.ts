import { describe, expect, it } from 'vitest'

import type { StartedUnifiedServer } from './app/server/route-types.js'
import { parseServeArgs, renderServeBanner, resolveChatServerOptions } from './cli-serve.js'
import { ChatServerConfigError, assertChatServerCanStart } from './server/codemind-chat-server.js'

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
  it('falls back to defaults with a canonical API key', () => {
    const options = resolveChatServerOptions({}, { CODETELLIGENCE_API_KEY: 'k' })
    expect(options).toEqual({ apiKey: 'k', host: '127.0.0.1', port: 8787 })
  })

  it('continues to accept the legacy CodeMind server namespace', () => {
    const options = resolveChatServerOptions({}, { CODEMIND_API_KEY: 'legacy-key' })
    expect(options.apiKey).toBe('legacy-key')
  })

  it('prefers Codetelligence values over legacy CodeMind values', () => {
    const options = resolveChatServerOptions(
      {},
      {
        CODETELLIGENCE_API_KEY: 'new-key',
        CODEMIND_API_KEY: 'old-key',
        CODETELLIGENCE_CHAT_HOST: '10.0.0.2',
        CODEMIND_CHAT_HOST: '10.0.0.1',
        CODETELLIGENCE_CHAT_PORT: '9001',
        CODEMIND_CHAT_PORT: '9000',
      },
    )
    expect(options).toMatchObject({ apiKey: 'new-key', host: '10.0.0.2', port: 9001 })
  })

  it('prefers CLI args over environment variables', () => {
    const options = resolveChatServerOptions(
      { host: '0.0.0.0', port: 1234 },
      {
        CODETELLIGENCE_API_KEY: 'k',
        CODETELLIGENCE_CHAT_HOST: '10.0.0.1',
        CODETELLIGENCE_CHAT_PORT: '9999',
      },
    )
    expect(options.host).toBe('0.0.0.0')
    expect(options.port).toBe(1234)
  })

  it('reads TLS file paths and cors origin from the canonical environment', () => {
    const options = resolveChatServerOptions(
      {},
      {
        CODETELLIGENCE_API_KEY: 'k',
        CODETELLIGENCE_CORS_ORIGIN: 'https://x.dev',
        CODETELLIGENCE_TLS_CERT_FILE: '/etc/tls/cert.pem',
        CODETELLIGENCE_TLS_KEY_FILE: '/etc/tls/key.pem',
      },
    )
    expect(options.corsOrigin).toBe('https://x.dev')
    expect(options.tlsCertFile).toBe('/etc/tls/cert.pem')
    expect(options.tlsKeyFile).toBe('/etc/tls/key.pem')
  })

  it('produces an empty api key when neither namespace is set, which fails fast to start', () => {
    const options = resolveChatServerOptions({}, {})
    expect(options.apiKey).toBe('')
    expect(() => assertChatServerCanStart(options)).toThrow(ChatServerConfigError)
  })
})

describe('renderServeBanner', () => {
  it('lists the Codetelligence identity, served routes, and listening url', () => {
    const server: StartedUnifiedServer = {
      server: {} as StartedUnifiedServer['server'],
      url: 'http://127.0.0.1:8787',
      host: '127.0.0.1',
      port: 8787,
      warnings: [],
    }
    const banner = renderServeBanner(server)
    expect(banner).toContain('Codetelligence')
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
