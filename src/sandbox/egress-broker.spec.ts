import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SANDBOX_EGRESS_CAPABILITY } from '../access/sandbox-capabilities.js'
import {
  EGRESS_GLOBAL_POLICY_ID,
  EgressPolicyCatalog,
  type EgressPolicyProfile,
} from './egress-policy.js'
import {
  EgressBrokerError,
  EgressMetrics,
  EnvironmentEgressPolicyRevisionSource,
  InMemoryEgressAuditSink,
  JsonlEgressAuditSink,
  SandboxEgressBroker,
  type EgressAuditSink,
  type EgressDnsResolver,
  type EgressHttpRequester,
  type EgressHttpResponse,
  type EgressPolicyRevisionSource,
} from './egress-broker.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

const PROFILE: EgressPolicyProfile = {
  id: 'runtime-api',
  version: 3,
  enabled: true,
  deploymentModes: ['local', 'hosted'],
  callerKinds: ['operator', 'delegated-grant', 'system'],
  allowedHosts: ['api.example.com', 'redirect.example.com', '*.services.example.com'],
  allowedMethods: ['GET', 'HEAD', 'POST'],
  allowedRequestHeaders: ['accept', 'content-type', 'x-request-id'],
  allowedPorts: [443],
  redirectPolicy: 'allowlisted',
  credentialPolicy: 'none',
  requireTls: true,
  auditRetentionDays: 30,
  limits: {
    maxRequests: 5,
    maxRequestBytes: 1_000,
    maxResponseBytes: 2_000,
    maxTotalSentBytes: 2_000,
    maxTotalReceivedBytes: 4_000,
    timeoutMs: 60_000,
    maxConcurrency: 2,
    maxRedirects: 2,
  },
}

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

function authorization(
  overrides: Partial<SandboxAuthorizationContext> = {},
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [SANDBOX_EGRESS_CAPABILITY],
    repositoryId: 'repository-1',
    workspaceId: 'workspace-1',
    missionId: 'mission-1',
    grantId: 'grant-1',
    grantVersion: 7,
    policyReference: { id: PROFILE.id, version: PROFILE.version },
    approval: {
      id: 'approval-1',
      capabilityId: SANDBOX_EGRESS_CAPABILITY,
      grantVersion: 7,
      policyVersions: {
        [EGRESS_GLOBAL_POLICY_ID]: 1,
        [PROFILE.id]: PROFILE.version,
        'grant:grant-1': 7,
        'mission:mission-1': 1,
        'egress-request-tightening': 1,
      },
    },
    ...overrides,
  }
}

function resolver(
  values: Readonly<
    Record<
      string,
      {
        readonly addresses: readonly { readonly address: string; readonly family: 4 | 6 }[]
        readonly cnameChain?: readonly string[]
      }
    >
  >,
): EgressDnsResolver & { readonly resolve: ReturnType<typeof vi.fn> } {
  const resolve = vi.fn(async (hostname: string) => {
    const value = values[hostname] ?? { addresses: [] }
    return {
      addresses: value.addresses,
      cnameChain: value.cnameChain ?? [],
    }
  })
  return { resolve }
}

function requester(
  responses: readonly (EgressHttpResponse | Error)[],
): EgressHttpRequester & { readonly request: ReturnType<typeof vi.fn> } {
  let index = 0
  const request = vi.fn(async () => {
    const response = responses[index]
    index += 1
    if (response === undefined) throw new Error('No egress response fixture configured.')
    if (response instanceof Error) throw response
    return response
  })
  return { request }
}

function response(
  statusCode: number,
  body: string = '',
  headers: Readonly<Record<string, string | readonly string[] | undefined>> = {},
): EgressHttpResponse {
  return { statusCode, body: Buffer.from(body), headers }
}

function broker(
  overrides: {
    readonly profile?: EgressPolicyProfile
    readonly resolver?: EgressDnsResolver
    readonly requester?: EgressHttpRequester
    readonly revisionSource?: EgressPolicyRevisionSource
    readonly auditSink?: EgressAuditSink
    readonly metrics?: EgressMetrics
    readonly env?: NodeJS.ProcessEnv
    readonly monotonicNow?: () => number
  } = {},
) {
  return new SandboxEgressBroker({
    catalog: new EgressPolicyCatalog([overrides.profile ?? PROFILE]),
    resolver:
      overrides.resolver ??
      resolver({
        'api.example.com': {
          addresses: [{ address: '93.184.216.34', family: 4 }],
        },
        'redirect.example.com': {
          addresses: [{ address: '93.184.216.35', family: 4 }],
        },
      }),
    requester: overrides.requester ?? requester([response(200, 'ok')]),
    ...(overrides.revisionSource === undefined ? {} : { revisionSource: overrides.revisionSource }),
    ...(overrides.auditSink === undefined ? {} : { auditSink: overrides.auditSink }),
    ...(overrides.metrics === undefined ? {} : { metrics: overrides.metrics }),
    env: overrides.env ?? {},
    now: () => new Date('2026-07-29T00:00:00.000Z'),
    ...(overrides.monotonicNow === undefined ? {} : { monotonicNow: overrides.monotonicNow }),
  })
}

describe('sandbox egress broker', () => {
  it('performs an address-pinned bounded request and records redacted evidence', async () => {
    const dns = resolver({
      'api.example.com': {
        addresses: [
          { address: '93.184.216.35', family: 4 },
          { address: '93.184.216.34', family: 4 },
          { address: '93.184.216.34', family: 4 },
        ],
      },
    })
    const http = requester([response(200, '{"ok":true}', { 'content-type': 'application/json' })])
    const audit = new InMemoryEgressAuditSink()
    const metrics = new EgressMetrics()
    const service = broker({ resolver: dns, requester: http, auditSink: audit, metrics })
    const session = service.openSession({
      authorization: authorization(),
      sessionId: 'secret-session',
    })

    const result = await session.request({
      url: 'https://api.example.com/v1/items?token=secret',
      headers: { accept: 'application/json', 'x-request-id': 'request-1' },
    })

    expect(Buffer.from(result.body).toString('utf8')).toBe('{"ok":true}')
    expect(result).toMatchObject({ statusCode: 200, requestCount: 1, bytesSent: 0 })
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedAddress: { address: '93.184.216.34', family: 4 },
        method: 'GET',
        maxResponseBytes: PROFILE.limits.maxResponseBytes,
      }),
    )
    const records = audit.snapshot()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      destinationHostname: 'api.example.com',
      decision: 'allowed',
      decisionCode: 'EGRESS_REQUEST_ALLOWED',
      resolvedAddressClass: 'public',
      statusCode: 200,
    })
    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain('secret-session')
    expect(serialized).not.toContain('token=secret')
    expect(serialized).not.toContain('request-1')
    expect(service.metricsSnapshot()).toMatchObject({
      activeSessions: 1,
      activeRequests: 0,
      allowedRequests: 1,
      deniedRequests: 0,
      bytesReceived: Buffer.byteLength('{"ok":true}'),
    })

    session.close()
    session.close()
    expect(service.metricsSnapshot().activeSessions).toBe(0)
  })

  it('fails closed before opening a session when authority is absent', () => {
    const service = broker()
    expect(() =>
      service.openSession({
        authorization: authorization({ approvedCapabilityIds: [] }),
        sessionId: 'session-1',
      }),
    ).toThrowError(expect.objectContaining({ code: 'EGRESS_CAPABILITY_NOT_APPROVED' }))
  })

  it('blocks mixed public/private answers, metadata, loopback, and IPv6 private destinations', async () => {
    for (const address of [
      { address: '127.0.0.1', family: 4 as const },
      { address: '10.0.0.1', family: 4 as const },
      { address: '169.254.169.254', family: 4 as const },
      { address: '::1', family: 6 as const },
      { address: 'fe80::1', family: 6 as const },
      { address: 'fc00::1', family: 6 as const },
      { address: '::ffff:127.0.0.1', family: 6 as const },
    ]) {
      const audit = new InMemoryEgressAuditSink()
      const service = broker({
        resolver: resolver({
          'api.example.com': {
            addresses: [{ address: '93.184.216.34', family: 4 }, address],
          },
        }),
        requester: requester([response(200, 'must-not-run')]),
        auditSink: audit,
      })
      const session = service.openSession({
        authorization: authorization(),
        sessionId: 'session-1',
      })
      await expect(session.request({ url: 'https://api.example.com/v1' })).rejects.toMatchObject({
        code: 'EGRESS_DNS_DESTINATION_FORBIDDEN',
      })
      expect(audit.snapshot()[0]).toMatchObject({
        decision: 'denied',
        resolvedAddressClass: 'forbidden',
      })
      session.close()
    }
  })

  it('rejects empty DNS and CNAME pivots outside the profile', async () => {
    const empty = broker({
      resolver: resolver({ 'api.example.com': { addresses: [] } }),
    }).openSession({ authorization: authorization(), sessionId: 'empty' })
    await expect(empty.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_DNS_EMPTY',
    })
    empty.close()

    const cname = broker({
      resolver: resolver({
        'api.example.com': {
          addresses: [{ address: '93.184.216.34', family: 4 }],
          cnameChain: ['internal.invalid'],
        },
      }),
    }).openSession({ authorization: authorization(), sessionId: 'cname' })
    await expect(cname.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_DNS_CNAME_NOT_ALLOWED',
    })
    cname.close()
  })

  it('re-runs URL, DNS, and revision policy on every redirect', async () => {
    let resolveCount = 0
    const dns: EgressDnsResolver = {
      resolve: vi.fn(async (hostname: string) => {
        resolveCount += 1
        if (hostname === 'redirect.example.com' && resolveCount > 1) {
          return {
            addresses: [{ address: '127.0.0.1', family: 4 as const }],
            cnameChain: [],
          }
        }
        return {
          addresses: [{ address: '93.184.216.34', family: 4 as const }],
          cnameChain: [],
        }
      }),
    }
    const http = requester([
      response(302, '', { location: 'https://redirect.example.com/final' }),
      response(200, 'must-not-run'),
    ])
    const session = broker({ resolver: dns, requester: http }).openSession({
      authorization: authorization(),
      sessionId: 'redirect-private',
    })

    await expect(session.request({ url: 'https://api.example.com/start' })).rejects.toMatchObject({
      code: 'EGRESS_DNS_DESTINATION_FORBIDDEN',
    })
    expect(dns.resolve).toHaveBeenCalledTimes(2)
    expect(http.request).toHaveBeenCalledTimes(1)
    session.close()
  })

  it('supports allowlisted redirects and converts 303 POST to GET without forwarding a body', async () => {
    const http = requester([
      response(303, '', { location: 'https://redirect.example.com/final' }),
      response(200, 'done'),
    ])
    const session = broker({ requester: http }).openSession({
      authorization: authorization(),
      sessionId: 'redirect-ok',
    })

    const result = await session.request({
      url: 'https://api.example.com/start',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"secret":"not-a-credential"}',
    })

    expect(result).toMatchObject({ statusCode: 200, requestCount: 2 })
    expect(http.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'GET', body: expect.objectContaining({ byteLength: 0 }) }),
    )
    session.close()
  })

  it('enforces redirect policy, host scope, location validity, and redirect quota', async () => {
    const deniedProfile = { ...PROFILE, redirectPolicy: 'denied' as const }
    const denied = broker({
      profile: deniedProfile,
      requester: requester([response(302, '', { location: '/final' })]),
    }).openSession({ authorization: authorization(), sessionId: 'redirect-denied' })
    await expect(denied.request({ url: 'https://api.example.com/start' })).rejects.toMatchObject({
      code: 'EGRESS_REDIRECT_DENIED',
    })
    denied.close()

    const sameHostProfile = { ...PROFILE, redirectPolicy: 'same-host' as const }
    const crossHost = broker({
      profile: sameHostProfile,
      requester: requester([response(302, '', { location: 'https://redirect.example.com/final' })]),
    }).openSession({ authorization: authorization(), sessionId: 'cross-host' })
    await expect(crossHost.request({ url: 'https://api.example.com/start' })).rejects.toMatchObject(
      {
        code: 'EGRESS_REDIRECT_HOST_DENIED',
      },
    )
    crossHost.close()

    const missing = broker({
      requester: requester([response(302)]),
    }).openSession({ authorization: authorization(), sessionId: 'missing-location' })
    await expect(missing.request({ url: 'https://api.example.com/start' })).rejects.toMatchObject({
      code: 'EGRESS_REDIRECT_INVALID',
    })
    missing.close()

    const quotaProfile = { ...PROFILE, limits: { ...PROFILE.limits, maxRedirects: 1 } }
    const quota = broker({
      profile: quotaProfile,
      requester: requester([
        response(302, '', { location: '/one' }),
        response(302, '', { location: '/two' }),
      ]),
    }).openSession({ authorization: authorization(), sessionId: 'redirect-quota' })
    await expect(quota.request({ url: 'https://api.example.com/start' })).rejects.toMatchObject({
      code: 'EGRESS_REDIRECT_QUOTA_EXCEEDED',
    })
    quota.close()
  })

  it('rejects redirect pivots to disallowed hosts and direct IPs', async () => {
    for (const location of ['https://evil.example/final', 'https://127.0.0.1/final']) {
      const http = requester([response(302, '', { location })])
      const session = broker({ requester: http }).openSession({
        authorization: authorization(),
        sessionId: `pivot-${location}`,
      })
      await expect(session.request({ url: 'https://api.example.com/start' })).rejects.toMatchObject(
        {
          code: expect.stringMatching(/EGRESS_(DESTINATION_NOT_ALLOWED|DIRECT_IP_FORBIDDEN)/),
        },
      )
      session.close()
    }
  })

  it('enforces request-count, send, receive, and response quotas', async () => {
    const requestQuota = broker({
      profile: { ...PROFILE, limits: { ...PROFILE.limits, maxRequests: 1 } },
      requester: requester([response(302, '', { location: '/again' })]),
    }).openSession({ authorization: authorization(), sessionId: 'request-quota' })
    await expect(
      requestQuota.request({ url: 'https://api.example.com/start' }),
    ).rejects.toMatchObject({ code: 'EGRESS_REQUEST_QUOTA_EXCEEDED' })
    requestQuota.close()

    const sendQuota = broker({
      profile: {
        ...PROFILE,
        limits: { ...PROFILE.limits, maxRequestBytes: 100, maxTotalSentBytes: 3 },
      },
    }).openSession({ authorization: authorization(), sessionId: 'send-quota' })
    await expect(
      sendQuota.request({ url: 'https://api.example.com/', method: 'POST', body: 'four' }),
    ).rejects.toMatchObject({ code: 'EGRESS_SEND_QUOTA_EXCEEDED' })
    sendQuota.close()

    const receiveQuota = broker({
      profile: { ...PROFILE, limits: { ...PROFILE.limits, maxTotalReceivedBytes: 2 } },
      requester: requester([response(200, 'three')]),
    }).openSession({ authorization: authorization(), sessionId: 'receive-quota' })
    await expect(receiveQuota.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_RECEIVE_QUOTA_EXCEEDED',
    })
    receiveQuota.close()

    const responseQuota = broker({
      requester: requester([
        new EgressBrokerError('EGRESS_RESPONSE_QUOTA_EXCEEDED', 'response too large'),
      ]),
    }).openSession({ authorization: authorization(), sessionId: 'response-quota' })
    await expect(responseQuota.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_RESPONSE_QUOTA_EXCEEDED',
    })
    responseQuota.close()
  })

  it('enforces concurrency without a quota race', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const http: EgressHttpRequester = {
      request: vi.fn(async () => {
        await pending
        return response(200, 'ok')
      }),
    }
    const metrics = new EgressMetrics()
    const session = broker({
      profile: { ...PROFILE, limits: { ...PROFILE.limits, maxConcurrency: 1 } },
      requester: http,
      metrics,
    }).openSession({ authorization: authorization(), sessionId: 'concurrency' })

    const first = session.request({ url: 'https://api.example.com/first' })
    await vi.waitFor(() => expect(session.snapshot().activeRequests).toBe(1))
    await expect(session.request({ url: 'https://api.example.com/second' })).rejects.toMatchObject({
      code: 'EGRESS_CONCURRENCY_EXCEEDED',
    })
    release()
    await expect(first).resolves.toMatchObject({ statusCode: 200 })
    expect(metrics.snapshot()).toMatchObject({ quotaExhaustions: 1, activeRequests: 0 })
    session.close()
  })

  it('honors cancellation before network access and records it in metrics', async () => {
    const controller = new AbortController()
    controller.abort()
    const dns = resolver({
      'api.example.com': { addresses: [{ address: '93.184.216.34', family: 4 }] },
    })
    const metrics = new EgressMetrics()
    const session = broker({ resolver: dns, metrics }).openSession({
      authorization: authorization(),
      sessionId: 'cancelled',
    })

    await expect(
      session.request({ url: 'https://api.example.com/', signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'EGRESS_CANCELLED' })
    expect(dns.resolve).not.toHaveBeenCalled()
    expect(metrics.snapshot().cancellations).toBe(1)
    session.close()
  })

  it('terminates active policy after global disable or profile revision change', async () => {
    const env: NodeJS.ProcessEnv = {}
    const service = broker({ env })
    const session = service.openSession({ authorization: authorization(), sessionId: 'disabled' })
    env['SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS'] = 'true'
    await expect(session.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_POLICY_REVOKED',
    })
    expect(service.metricsSnapshot().policyRevocations).toBe(1)
    session.close()

    const revisionSource: EgressPolicyRevisionSource = {
      read: () => ({
        globalVersion: 1,
        policyVersion: PROFILE.version + 1,
        emergencyDisabled: false,
      }),
    }
    const revised = broker({ revisionSource }).openSession({
      authorization: authorization(),
      sessionId: 'revised',
    })
    await expect(revised.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_POLICY_REVOKED',
    })
    revised.close()
  })

  it('uses environment-backed global, profile, and emergency revision controls', () => {
    const policy = broker().authorize({}, authorization()).policy!
    expect(new EnvironmentEgressPolicyRevisionSource({}).read(policy)).toEqual({
      globalVersion: 1,
      policyVersion: PROFILE.version,
      emergencyDisabled: false,
    })
    expect(
      new EnvironmentEgressPolicyRevisionSource({
        SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION: '2',
        SYMBOLWRIGHT_EGRESS_POLICY_VERSION_RUNTIME_API: '4',
        SYMBOLWRIGHT_DISABLE_EGRESS_POLICY_RUNTIME_API: 'true',
      }).read(policy),
    ).toEqual({ globalVersion: 2, policyVersion: 4, emergencyDisabled: true })
  })

  it('enforces total session duration and rejects use after close', async () => {
    let time = 0
    const session = broker({
      profile: { ...PROFILE, limits: { ...PROFILE.limits, timeoutMs: 10 } },
      monotonicNow: () => time,
    }).openSession({ authorization: authorization(), sessionId: 'timeout' })
    time = 11
    await expect(session.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_TIMEOUT',
    })
    session.close()
    await expect(session.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_SESSION_CLOSED',
    })
  })

  it('fails closed when durable audit persistence fails', async () => {
    const auditSink: EgressAuditSink = {
      append: vi.fn(async () => {
        throw new Error('disk unavailable')
      }),
    }
    const session = broker({ auditSink }).openSession({
      authorization: authorization(),
      sessionId: 'audit-failure',
    })

    await expect(session.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_AUDIT_WRITE_FAILED',
    })
    session.close()
  })

  it('writes append-only JSONL evidence with restrictive filesystem modes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-egress-audit-'))
    tempRoots.push(root)
    const sink = new JsonlEgressAuditSink(path.join(root, 'state'))
    await sink.append({
      schemaVersion: 1,
      recordedAt: '2026-07-29T00:00:00.000Z',
      sessionIdHash: 'a'.repeat(64),
      policyId: PROFILE.id,
      policyVersion: PROFILE.version,
      policyFingerprint: 'b'.repeat(64),
      destinationHostname: 'api.example.com',
      destinationPathHash: 'c'.repeat(64),
      method: 'GET',
      decision: 'allowed',
      decisionCode: 'EGRESS_REQUEST_ALLOWED',
      requestCount: 1,
      bytesSent: 0,
      bytesReceived: 2,
      durationMs: 10,
      resolvedAddressClass: 'public',
      statusCode: 200,
    })

    const filePath = path.join(root, 'state', 'sandbox-egress-audit.jsonl')
    const content = await fs.readFile(filePath, 'utf8')
    expect(JSON.parse(content.trim())).toMatchObject({
      destinationHostname: 'api.example.com',
      decisionCode: 'EGRESS_REQUEST_ALLOWED',
    })
    expect((await fs.stat(filePath)).mode & 0o077).toBe(0)
  })

  it('rejects an unsafe audit parent symlink', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-egress-audit-link-'))
    tempRoots.push(root)
    await fs.mkdir(path.join(root, 'real'))
    await fs.symlink(path.join(root, 'real'), path.join(root, 'linked'))
    const sink = new JsonlEgressAuditSink(path.join(root, 'linked'))

    await expect(
      sink.append({
        schemaVersion: 1,
        recordedAt: '2026-07-29T00:00:00.000Z',
        sessionIdHash: 'a'.repeat(64),
        policyId: PROFILE.id,
        policyVersion: PROFILE.version,
        policyFingerprint: 'b'.repeat(64),
        destinationHostname: 'api.example.com',
        destinationPathHash: 'c'.repeat(64),
        method: 'GET',
        decision: 'denied',
        decisionCode: 'EGRESS_DENIED',
        requestCount: 0,
        bytesSent: 0,
        bytesReceived: 0,
        durationMs: 0,
        resolvedAddressClass: 'unresolved',
      }),
    ).rejects.toMatchObject({ code: 'EGRESS_AUDIT_PATH_UNSAFE' })
  })

  it('maps unknown requester errors to a redacted internal broker error', async () => {
    const session = broker({ requester: requester([new Error('socket failed')]) }).openSession({
      authorization: authorization(),
      sessionId: 'unknown-error',
    })
    await expect(session.request({ url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'EGRESS_INTERNAL_ERROR',
      message: 'socket failed',
    })
    session.close()
  })
})
