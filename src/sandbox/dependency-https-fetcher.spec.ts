import { describe, expect, it, vi } from 'vitest'

import type { EffectiveDependencyPolicy } from './dependency-policy.js'
import {
  DependencyHttpsFetcher,
  isPublicDependencyAddress,
  type DependencyDnsResolver,
  type DependencyHttpRequester,
  type DependencyHttpResponse,
} from './dependency-https-fetcher.js'

const POLICY: EffectiveDependencyPolicy = {
  schemaVersion: 1,
  policyId: 'npm-production',
  policyVersion: 3,
  fingerprint: 'c'.repeat(64),
  resolvedAt: '2026-07-29T00:00:00.000Z',
  ecosystem: 'npm',
  deploymentMode: 'hosted',
  callerKind: 'delegated-grant',
  capabilityId: 'symbolwright.dependencies.acquire',
  allowedRegistries: ['https://registry.npmjs.org/'],
  requireLockfile: true,
  allowLockfileMutation: false,
  suppressLifecycleScripts: true,
  directIpDestinations: 'denied',
  cacheNamespace: 'npm-production-v3',
  limits: {
    maxPackages: 100,
    maxRequests: 5,
    maxArchiveBytes: 1_000,
    maxExpandedBytes: 10_000,
    maxFiles: 1_000,
    maxFileBytes: 1_000,
    maxTotalBytes: 20_000,
    timeoutMs: 60_000,
    maxConcurrency: 2,
  },
  sources: [
    { id: 'dependency-global', version: 1, kind: 'global' },
    { id: 'npm-production', version: 3, kind: 'operator-profile' },
  ],
}

function resolver(
  entries: Readonly<
    Record<string, readonly { readonly address: string; readonly family: 4 | 6 }[]>
  >,
): DependencyDnsResolver {
  return {
    resolve: vi.fn(async (hostname: string) => entries[hostname] ?? []),
  }
}

function requester(responses: readonly DependencyHttpResponse[]): DependencyHttpRequester & {
  readonly get: ReturnType<typeof vi.fn>
} {
  let index = 0
  const get = vi.fn(async () => {
    const response = responses[index]
    index += 1
    if (response === undefined) throw new Error('No response fixture configured.')
    return response
  })
  return { get }
}

function response(
  statusCode: number,
  body: Uint8Array = Buffer.alloc(0),
  headers: Readonly<Record<string, string | readonly string[] | undefined>> = {},
): DependencyHttpResponse {
  return { statusCode, body, headers }
}

describe('dependency HTTPS fetcher', () => {
  it('pins a public DNS result and returns bounded bytes', async () => {
    const dns = resolver({
      'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
    })
    const http = requester([response(200, Buffer.from('archive'))])
    const fetcher = new DependencyHttpsFetcher({ resolver: dns, requester: http })

    const result = await fetcher.fetch({
      url: 'https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz',
      policy: POLICY,
    })

    expect(Buffer.from(result.bytes).toString('utf8')).toBe('archive')
    expect(result.requestCount).toBe(1)
    expect(result.resolvedAddressSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(http.get).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedAddress: { address: '104.16.24.34', family: 4 },
        maxBytes: POLICY.limits.maxArchiveBytes,
      }),
    )
  })

  it.each([
    ['127.0.0.1', 4],
    ['10.0.0.1', 4],
    ['169.254.169.254', 4],
    ['192.168.1.1', 4],
    ['::1', 6],
    ['fe80::1', 6],
    ['fc00::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['::ffff:7f00:1', 6],
  ] as const)('classifies %s as forbidden', (address, family) => {
    expect(isPublicDependencyAddress({ address, family })).toBe(false)
  })

  it('classifies family mismatches as invalid and public IPv6 destinations as allowed', () => {
    expect(isPublicDependencyAddress({ address: '104.16.24.34', family: 6 })).toBe(false)
    expect(isPublicDependencyAddress({ address: '2606:4700::6810:1822', family: 6 })).toBe(true)
    expect(isPublicDependencyAddress({ address: '::ffff:104.16.24.34', family: 6 })).toBe(true)
    expect(isPublicDependencyAddress({ address: '::ffff:6810:1822', family: 6 })).toBe(true)
  })

  it('fails closed when DNS mixes public and private answers', async () => {
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({
        'registry.npmjs.org': [
          { address: '104.16.24.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      }),
      requester: requester([response(200, Buffer.from('must-not-run'))]),
    })

    await expect(
      fetcher.fetch({
        url: 'https://registry.npmjs.org/fixture.tgz',
        policy: POLICY,
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_DNS_DESTINATION_FORBIDDEN' })
  })

  it('fails closed on empty DNS answers and rejected HTTP statuses', async () => {
    const emptyDns = new DependencyHttpsFetcher({
      resolver: resolver({}),
      requester: requester([]),
    })
    await expect(
      emptyDns.fetch({ url: 'https://registry.npmjs.org/archive.tgz', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_DNS_EMPTY' })

    const rejectedStatus = new DependencyHttpsFetcher({
      resolver: resolver({
        'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
      }),
      requester: requester([response(503)]),
    })
    await expect(
      rejectedStatus.fetch({ url: 'https://registry.npmjs.org/archive.tgz', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_HTTP_STATUS_REJECTED' })
  })

  it('re-runs URL and DNS policy for every redirect', async () => {
    const dns = resolver({
      'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
    })
    const http = requester([
      response(302, Buffer.alloc(0), {
        location: '/fixture/-/fixture-1.0.0.tgz',
      }),
      response(200, Buffer.from('archive')),
    ])
    const fetcher = new DependencyHttpsFetcher({ resolver: dns, requester: http })

    const result = await fetcher.fetch({
      url: 'https://registry.npmjs.org/fixture',
      policy: POLICY,
    })

    expect(result.requestCount).toBe(2)
    expect(http.get).toHaveBeenCalledTimes(2)
  })

  it('handles array redirect headers and deterministically sorts deduplicated addresses', async () => {
    const http = requester([
      response(302, Buffer.alloc(0), { location: ['/archive.tgz'] }),
      response(200, Buffer.from('archive')),
    ])
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({
        'registry.npmjs.org': [
          { address: '2606:4700::6810:1822', family: 6 },
          { address: '104.16.25.34', family: 4 },
          { address: '104.16.24.34', family: 4 },
          { address: '104.16.24.34', family: 4 },
        ],
      }),
      requester: http,
    })

    const result = await fetcher.fetch({
      url: 'https://registry.npmjs.org/start#ignored',
      policy: POLICY,
    })

    expect(result.finalUrl).toBe('https://registry.npmjs.org/archive.tgz')
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        pinnedAddress: { address: '104.16.24.34', family: 4 },
      }),
    )
  })

  it('rejects redirects without a location and malformed redirect targets', async () => {
    const publicResolver = resolver({
      'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
    })
    const missingLocation = new DependencyHttpsFetcher({
      resolver: publicResolver,
      requester: requester([response(302)]),
    })
    await expect(
      missingLocation.fetch({ url: 'https://registry.npmjs.org/start', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_REDIRECT_INVALID' })

    const malformedLocation = new DependencyHttpsFetcher({
      resolver: publicResolver,
      requester: requester([response(302, Buffer.alloc(0), { location: 'https://[' })]),
    })
    await expect(
      malformedLocation.fetch({ url: 'https://registry.npmjs.org/start', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_REDIRECT_INVALID' })
  })

  it('rejects redirect pivots outside the registry policy', async () => {
    const http = requester([
      response(302, Buffer.alloc(0), { location: 'https://evil.example/archive.tgz' }),
    ])
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({
        'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
      }),
      requester: http,
    })

    await expect(
      fetcher.fetch({ url: 'https://registry.npmjs.org/fixture', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_URL_NOT_ALLOWED' })
  })

  it('rejects malformed, direct-IP, credentialed, non-HTTPS, and alternate-port URLs', async () => {
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({}),
      requester: requester([]),
    })

    await expect(fetcher.fetch({ url: 'not a URL', policy: POLICY })).rejects.toMatchObject({
      code: 'DEPENDENCY_URL_INVALID',
    })

    for (const url of [
      'https://127.0.0.1/archive.tgz',
      'https://user:secret@registry.npmjs.org/archive.tgz',
      'http://registry.npmjs.org/archive.tgz',
      'https://registry.npmjs.org:8443/archive.tgz',
    ]) {
      await expect(fetcher.fetch({ url, policy: POLICY })).rejects.toMatchObject({
        code: expect.stringMatching(/DEPENDENCY_(URL|PORT)_NOT_ALLOWED/),
      })
    }
  })

  it('enforces request, response, redirect, and wall-time quotas', async () => {
    const publicResolver = resolver({
      'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
    })
    const noRequests = requester([])
    const requestLimited = new DependencyHttpsFetcher({
      resolver: publicResolver,
      requester: noRequests,
    })
    await expect(
      requestLimited.fetch({
        url: 'https://registry.npmjs.org/archive.tgz',
        policy: { ...POLICY, limits: { ...POLICY.limits, maxRequests: 0 } },
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_REQUEST_QUOTA_EXCEEDED' })
    expect(noRequests.get).not.toHaveBeenCalled()

    const timeoutLimited = new DependencyHttpsFetcher({
      resolver: publicResolver,
      requester: noRequests,
    })
    await expect(
      timeoutLimited.fetch({
        url: 'https://registry.npmjs.org/archive.tgz',
        policy: { ...POLICY, limits: { ...POLICY.limits, timeoutMs: 0 } },
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_FETCH_TIMEOUT' })

    const redirecting = new DependencyHttpsFetcher({
      resolver: publicResolver,
      requester: requester([
        response(302, Buffer.alloc(0), { location: '/1' }),
        response(302, Buffer.alloc(0), { location: '/2' }),
        response(302, Buffer.alloc(0), { location: '/3' }),
        response(302, Buffer.alloc(0), { location: '/4' }),
      ]),
    })
    await expect(
      redirecting.fetch({ url: 'https://registry.npmjs.org/start', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_REDIRECT_QUOTA_EXCEEDED' })

    const oversized = new DependencyHttpsFetcher({
      resolver: publicResolver,
      requester: requester([response(200, Buffer.alloc(POLICY.limits.maxArchiveBytes + 1))]),
    })
    await expect(
      oversized.fetch({ url: 'https://registry.npmjs.org/archive.tgz', policy: POLICY }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_RESPONSE_QUOTA_EXCEEDED' })
  })

  it('honors cancellation before making a request', async () => {
    const controller = new AbortController()
    controller.abort()
    const http = requester([response(200, Buffer.from('must-not-run'))])
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({
        'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
      }),
      requester: http,
    })

    await expect(
      fetcher.fetch({
        url: 'https://registry.npmjs.org/archive.tgz',
        policy: POLICY,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_FETCH_CANCELLED' })
    expect(http.get).not.toHaveBeenCalled()
  })

  it('passes cancellation authority to transport and rechecks it after the response', async () => {
    const controller = new AbortController()
    const get = vi.fn(
      async (input: Parameters<DependencyHttpRequester['get']>[0]): Promise<DependencyHttpResponse> => {
        expect(input.signal).toBe(controller.signal)
        controller.abort()
        return response(200, Buffer.from('must-not-return'))
      },
    )
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({
        'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
      }),
      requester: { get },
    })

    await expect(
      fetcher.fetch({
        url: 'https://registry.npmjs.org/archive.tgz',
        policy: POLICY,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_FETCH_CANCELLED' })
    expect(get).toHaveBeenCalledTimes(1)
  })
})
