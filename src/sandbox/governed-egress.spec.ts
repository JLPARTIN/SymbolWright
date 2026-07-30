import { describe, expect, it } from 'vitest'

import { buildEgressAuthorization } from './egress-authorization.js'
import type { EgressSessionResult } from './egress-broker.js'
import {
  parseGovernedEgressRequest,
  renderGovernedEgressResult,
  requestGovernedEgress,
} from './governed-egress.js'
import type { ApplicationSandboxNetworkRuntime } from './sandbox-network-runtime.js'

describe('governed egress request parsing', () => {
  it('accepts bounded caller request fields', () => {
    expect(
      parseGovernedEgressRequest({
        url: 'https://docs.example.com/guide',
        method: 'get',
        headers: { accept: 'text/plain' },
        limits: { maxRequests: 1 },
      }),
    ).toEqual({
      url: 'https://docs.example.com/guide',
      method: 'GET',
      headers: { accept: 'text/plain' },
      limits: { maxRequests: 1 },
    })
  })

  it.each(['policy', 'approval', 'grantId', 'sessionId', 'proxy', 'pinnedAddress'])(
    'rejects caller-controlled authority field %s',
    (field) => {
      expect(() =>
        parseGovernedEgressRequest({ url: 'https://example.com', [field]: 'x' }),
      ).toThrow('rejects caller-controlled authority field')
    },
  )
})

describe('governed egress result redaction', () => {
  it('never renders the raw final URL, path, or query — only a redacted hostname', async () => {
    const sensitiveFinalUrl = 'https://redirected.example.com/private/path?token=must-not-leak'
    const fakeRuntime = {
      gateway: {
        requestEgress: async (): Promise<EgressSessionResult> => ({
          statusCode: 200,
          headers: {},
          body: new TextEncoder().encode('ok'),
          finalUrl: sensitiveFinalUrl,
          requestCount: 1,
          bytesSent: 10,
          bytesReceived: 2,
        }),
      },
    } as unknown as ApplicationSandboxNetworkRuntime

    const authorization = buildEgressAuthorization({
      policyReference: { id: 'docs-only', version: 1 },
      deploymentMode: 'local',
      callerKind: 'operator',
      runtimeMode: 'APPROVED_EXECUTION',
      repositoryId: 'owner/repo',
      workspaceId: 'mission-1',
      capabilityApproved: true,
      operatorApproved: true,
    })

    const result = await requestGovernedEgress({
      runtime: fakeRuntime,
      authorization,
      request: { url: 'https://docs.example.com/secret-path?apiKey=leak-me' },
    })
    const rendered = renderGovernedEgressResult(result)

    expect(rendered).not.toContain('must-not-leak')
    expect(rendered).not.toContain('/private/path')
    expect(rendered).not.toContain('/secret-path')
    expect(rendered).not.toContain('apiKey')
    expect(JSON.parse(rendered)).toMatchObject({
      destinationHostname: 'docs.example.com',
      response: { finalHostname: 'redirected.example.com' },
    })
  })
})
