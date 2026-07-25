import { describe, expect, it, vi } from 'vitest'

import {
  AELIB_CONNECTOR_ID,
  checkAelibConnection,
  resolveAelibConnectorConfig,
  type AelibHealthTransport,
} from './aelib-connector.js'

const NOW = new Date('2026-06-29T00:00:00.000Z')

function transport(status: number): AelibHealthTransport {
  return {
    request: vi.fn(async () => ({ status, body: { ok: status >= 200 && status < 300 } })),
  }
}

describe('AELIB connector contract', () => {
  it('resolves missing endpoint as not configured without secrets', () => {
    const config = resolveAelibConnectorConfig({})

    expect(config).toEqual({
      connectorId: AELIB_CONNECTOR_ID,
      healthPath: '/health',
      tokenState: 'missing',
    })
  })

  it('normalizes endpoint, health path, and token state from canonical env vars', () => {
    const config = resolveAelibConnectorConfig({
      SYMBOLWRIGHT_AELIB_ENDPOINT: 'http://127.0.0.1:3000',
      SYMBOLWRIGHT_AELIB_HEALTH_PATH: 'api/health',
      SYMBOLWRIGHT_AELIB_TOKEN: 'secret-token',
    })

    expect(config).toEqual({
      connectorId: AELIB_CONNECTOR_ID,
      endpoint: 'http://127.0.0.1:3000',
      healthPath: '/api/health',
      tokenState: 'configured',
    })
  })

  it('falls back to legacy CODEMIND_AELIB_* env vars when canonical ones are unset', () => {
    const config = resolveAelibConnectorConfig({
      CODEMIND_AELIB_ENDPOINT: 'http://127.0.0.1:3000',
      CODEMIND_AELIB_HEALTH_PATH: 'api/health',
      CODEMIND_AELIB_TOKEN: 'secret-token',
    })

    expect(config).toEqual({
      connectorId: AELIB_CONNECTOR_ID,
      endpoint: 'http://127.0.0.1:3000',
      healthPath: '/api/health',
      tokenState: 'configured',
    })
  })

  it('falls back to the bare AELIB_* env vars when neither prefixed form is set', () => {
    const config = resolveAelibConnectorConfig({
      AELIB_ENDPOINT: 'http://127.0.0.1:3000',
      AELIB_HEALTH_PATH: 'api/health',
      AELIB_TOKEN: 'secret-token',
    })

    expect(config).toEqual({
      connectorId: AELIB_CONNECTOR_ID,
      endpoint: 'http://127.0.0.1:3000',
      healthPath: '/api/health',
      tokenState: 'configured',
    })
  })

  it('prefers SYMBOLWRIGHT_AELIB_ENDPOINT over CODEMIND_AELIB_ENDPOINT and bare AELIB_ENDPOINT', () => {
    const config = resolveAelibConnectorConfig({
      SYMBOLWRIGHT_AELIB_ENDPOINT: 'http://canonical:3000',
      CODEMIND_AELIB_ENDPOINT: 'http://legacy:3000',
      AELIB_ENDPOINT: 'http://bare:3000',
    })

    expect(config.endpoint).toBe('http://canonical:3000')
  })

  it('does not call the transport when the endpoint is not configured', async () => {
    const testTransport = transport(200)
    const status = await checkAelibConnection({ env: {}, transport: testTransport, now: () => NOW })

    expect(status.state).toBe('NOT_CONFIGURED')
    expect(status.detail).toContain('SYMBOLWRIGHT_AELIB_ENDPOINT')
    expect(testTransport.request).not.toHaveBeenCalled()
  })

  it('reports misconfigured endpoint URLs without transport calls', async () => {
    const testTransport = transport(200)
    const status = await checkAelibConnection({
      env: { SYMBOLWRIGHT_AELIB_ENDPOINT: 'not a url' },
      transport: testTransport,
      now: () => NOW,
    })

    expect(status.state).toBe('MISCONFIGURED')
    expect(status.detail).toContain('Invalid AELIB endpoint URL')
    expect(testTransport.request).not.toHaveBeenCalled()
  })

  it('reports connected only after a real 2xx health response, sending the canonical connector header', async () => {
    const testTransport = transport(204)
    const status = await checkAelibConnection({
      env: {
        SYMBOLWRIGHT_AELIB_ENDPOINT: 'http://127.0.0.1:3000/',
        SYMBOLWRIGHT_AELIB_TOKEN: 'secret-token',
      },
      transport: testTransport,
      now: () => NOW,
    })

    expect(status.state).toBe('CONNECTED')
    expect(status.healthUrl).toBe('http://127.0.0.1:3000/health')
    expect(status.tokenState).toBe('configured')
    expect(status.checkedAt).toBe(NOW.toISOString())
    expect(testTransport.request).toHaveBeenCalledWith('http://127.0.0.1:3000/health', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer secret-token',
        'x-symbolwright-connector': AELIB_CONNECTOR_ID,
      },
    })
  })

  it('does not claim connected on non-2xx health responses', async () => {
    const status = await checkAelibConnection({
      env: { SYMBOLWRIGHT_AELIB_ENDPOINT: 'http://127.0.0.1:3000' },
      transport: transport(503),
      now: () => NOW,
    })

    expect(status.state).toBe('UNREACHABLE')
    expect(status.detail).toContain('HTTP 503')
  })

  it('does not expose token material in status output', async () => {
    const status = await checkAelibConnection({
      env: {
        SYMBOLWRIGHT_AELIB_ENDPOINT: 'http://127.0.0.1:3000',
        SYMBOLWRIGHT_AELIB_TOKEN: 'super-secret-token',
      },
      transport: transport(200),
      now: () => NOW,
    })

    expect(JSON.stringify(status)).not.toContain('super-secret-token')
    expect(status.tokenState).toBe('configured')
  })
})
