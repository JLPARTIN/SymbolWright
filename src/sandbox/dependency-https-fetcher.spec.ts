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

  it('rejects direct IP, embedded credentials, non-HTTPS, and alternate ports', async () => {
    const fetcher = new DependencyHttpsFetcher({
      resolver: resolver({}),
      requester: requester([]),
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

  it('enforces request, response, and redirect quotas', async () => {
    const publicResolver = resolver({
      'registry.npmjs.org': [{ address: '104.16.24.34', family: 4 }],
    })
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
})
