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

  it('normalizes endpoint, health path, and token state from env', () => {
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

  it('does not call the transport when the endpoint is not configured', async () => {
    const testTransport = transport(200)
    const status = await checkAelibConnection({ env: {}, transport: testTransport, now: () => NOW })

    expect(status.state).toBe('NOT_CONFIGURED')
    expect(status.detail).toContain('CODEMIND_AELIB_ENDPOINT')
    expect(testTransport.request).not.toHaveBeenCalled()
  })

  it('reports misconfigured endpoint URLs without transport calls', async () => {
    const testTransport = transport(200)
    const status = await checkAelibConnection({
      env: { CODEMIND_AELIB_ENDPOINT: 'not a url' },
      transport: testTransport,
      now: () => NOW,
    })

    expect(status.state).toBe('MISCONFIGURED')
    expect(status.detail).toContain('Invalid AELIB endpoint URL')
    expect(testTransport.request).not.toHaveBeenCalled()
  })

  it('reports connected only after a real 2xx health response', async () => {
    const testTransport = transport(204)
    const status = await checkAelibConnection({
      env: {
        CODEMIND_AELIB_ENDPOINT: 'http://127.0.0.1:3000/',
        CODEMIND_AELIB_TOKEN: 'secret-token',
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
        'x-codemind-connector': AELIB_CONNECTOR_ID,
      },
    })
  })

  it('does not claim connected on non-2xx health responses', async () => {
    const status = await checkAelibConnection({
      env: { CODEMIND_AELIB_ENDPOINT: 'http://127.0.0.1:3000' },
      transport: transport(503),
      now: () => NOW,
    })

    expect(status.state).toBe('UNREACHABLE')
    expect(status.detail).toContain('HTTP 503')
  })

  it('does not expose token material in status output', async () => {
    const status = await checkAelibConnection({
      env: {
        CODEMIND_AELIB_ENDPOINT: 'http://127.0.0.1:3000',
        CODEMIND_AELIB_TOKEN: 'super-secret-token',
      },
      transport: transport(200),
      now: () => NOW,
    })

    expect(JSON.stringify(status)).not.toContain('super-secret-token')
    expect(status.tokenState).toBe('configured')
  })
})
