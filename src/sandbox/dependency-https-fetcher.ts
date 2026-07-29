import { createHash } from 'node:crypto'
import { promises as dns, type LookupAddress } from 'node:dns'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

import {
  isUrlAllowedByRegistryPolicy,
  type EffectiveDependencyPolicy,
} from './dependency-policy.js'

export interface DependencyResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

export interface DependencyDnsResolver {
  readonly resolve: (hostname: string) => Promise<readonly DependencyResolvedAddress[]>
}

export interface DependencyHttpResponse {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly body: Uint8Array
}

export interface DependencyHttpRequester {
  readonly get: (input: {
    readonly url: URL
    readonly pinnedAddress: DependencyResolvedAddress
    readonly maxBytes: number
    readonly timeoutMs: number
    readonly signal?: AbortSignal
  }) => Promise<DependencyHttpResponse>
}

export interface DependencyFetchResult {
  readonly bytes: Uint8Array
  readonly finalUrl: string
  readonly requestCount: number
  readonly resolvedAddressSha256: string
}

export class DependencyFetchError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'DependencyFetchError'
    this.code = code
  }
}

export interface DependencyHttpsFetcherOptions {
  readonly resolver?: DependencyDnsResolver
  readonly requester?: DependencyHttpRequester
}

const MAX_REDIRECTS = 3
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])
const IPV4_BLOCKLIST = createIpv4BlockList()
const IPV6_BLOCKLIST = createIpv6BlockList()

/**
 * Dedicated dependency-network client. Every hop is re-authorized, DNS is resolved by the broker,
 * mixed public/private answers fail closed, and the selected address is pinned into TLS transport.
 */
export class DependencyHttpsFetcher {
  private readonly resolver: DependencyDnsResolver
  private readonly requester: DependencyHttpRequester

  public constructor(options: DependencyHttpsFetcherOptions = {}) {
    this.resolver = options.resolver ?? new SystemDependencyDnsResolver()
    this.requester = options.requester ?? new NodeDependencyHttpsRequester()
  }

  public async fetch(input: {
    readonly url: string
    readonly policy: EffectiveDependencyPolicy
    readonly signal?: AbortSignal
  }): Promise<DependencyFetchResult> {
    const startedAt = Date.now()
    let current = parseAuthorizedUrl(input.url, input.policy)
    let requestCount = 0
    let redirectCount = 0

    for (;;) {
      assertNotCancelled(input.signal)
      requestCount += 1
      if (requestCount > input.policy.limits.maxRequests) {
        throw new DependencyFetchError(
          'DEPENDENCY_REQUEST_QUOTA_EXCEEDED',
          `Dependency acquisition exceeded ${input.policy.limits.maxRequests} requests.`,
        )
      }
      const remainingMs = input.policy.limits.timeoutMs - (Date.now() - startedAt)
      if (remainingMs <= 0) {
        throw new DependencyFetchError(
          'DEPENDENCY_FETCH_TIMEOUT',
          'Dependency acquisition exceeded the effective policy timeout.',
        )
      }

      const resolved = uniqueAddresses(await this.resolver.resolve(current.hostname))
      if (resolved.length === 0) {
        throw new DependencyFetchError(
          'DEPENDENCY_DNS_EMPTY',
          `Dependency registry hostname did not resolve: ${current.hostname}`,
        )
      }
      if (resolved.some((entry) => !isPublicDependencyAddress(entry))) {
        throw new DependencyFetchError(
          'DEPENDENCY_DNS_DESTINATION_FORBIDDEN',
          `Dependency registry DNS included a forbidden destination class for ${current.hostname}.`,
        )
      }
      const selected = resolved[0]
      if (selected === undefined) {
        throw new DependencyFetchError(
          'DEPENDENCY_DNS_EMPTY',
          `Dependency registry hostname did not resolve: ${current.hostname}`,
        )
      }

      const response = await this.requester.get({
        url: current,
        pinnedAddress: selected,
        maxBytes: input.policy.limits.maxArchiveBytes,
        timeoutMs: remainingMs,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      assertNotCancelled(input.signal)

      if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
        redirectCount += 1
        if (redirectCount > Math.min(MAX_REDIRECTS, input.policy.limits.maxRequests - 1)) {
          throw new DependencyFetchError(
            'DEPENDENCY_REDIRECT_QUOTA_EXCEEDED',
            `Dependency acquisition exceeded ${MAX_REDIRECTS} redirects.`,
          )
        }
        const location = firstHeader(response.headers['location'])
        if (location === undefined) {
          throw new DependencyFetchError(
            'DEPENDENCY_REDIRECT_INVALID',
            'Dependency registry redirect did not include a Location header.',
          )
        }
        try {
          current = parseAuthorizedUrl(new URL(location, current).toString(), input.policy)
        } catch (error) {
          if (error instanceof DependencyFetchError) throw error
          throw new DependencyFetchError(
            'DEPENDENCY_REDIRECT_INVALID',
            'Dependency registry returned an invalid redirect URL.',
          )
        }
        continue
      }

      if (response.statusCode !== 200) {
        throw new DependencyFetchError(
          'DEPENDENCY_HTTP_STATUS_REJECTED',
          `Dependency registry returned HTTP ${response.statusCode}.`,
        )
      }
      if (response.body.byteLength > input.policy.limits.maxArchiveBytes) {
        throw new DependencyFetchError(
          'DEPENDENCY_RESPONSE_QUOTA_EXCEEDED',
          `Dependency response exceeded ${input.policy.limits.maxArchiveBytes} bytes.`,
        )
      }
      return {
        bytes: response.body,
        finalUrl: current.toString(),
        requestCount,
        resolvedAddressSha256: sha256(`${selected.family}:${selected.address}`),
      }
    }
  }
}

export function isPublicDependencyAddress(value: DependencyResolvedAddress): boolean {
  if (value.family !== isIP(value.address)) return false
  const mapped = ipv4MappedAddress(value.address)
  if (mapped !== undefined) return !IPV4_BLOCKLIST.check(mapped, 'ipv4')
  return value.family === 4
    ? !IPV4_BLOCKLIST.check(value.address, 'ipv4')
    : !IPV6_BLOCKLIST.check(value.address, 'ipv6')
}

class SystemDependencyDnsResolver implements DependencyDnsResolver {
  public async resolve(hostname: string): Promise<readonly DependencyResolvedAddress[]> {
    let addresses: LookupAddress[]
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true })
    } catch (error) {
      throw new DependencyFetchError(
        'DEPENDENCY_DNS_FAILED',
        `Dependency registry DNS resolution failed: ${errorMessage(error)}`,
      )
    }
    return addresses.map((entry) => ({
      address: entry.address,
      family: entry.family === 6 ? 6 : 4,
    }))
  }
}

class NodeDependencyHttpsRequester implements DependencyHttpRequester {
  public async get(input: {
    readonly url: URL
    readonly pinnedAddress: DependencyResolvedAddress
    readonly maxBytes: number
    readonly timeoutMs: number
    readonly signal?: AbortSignal
  }): Promise<DependencyHttpResponse> {
    return new Promise<DependencyHttpResponse>((resolve, reject) => {
      let settled = false
      let total = 0
      const chunks: Buffer[] = []
      const lookup: LookupFunction = (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all === true) {
          callback(null, [input.pinnedAddress])
          return
        }
        callback(null, input.pinnedAddress.address, input.pinnedAddress.family)
      }
      const request = https.request(
        {
          protocol: 'https:',
          hostname: input.url.hostname,
          port: input.url.port.length === 0 ? 443 : Number(input.url.port),
          path: `${input.url.pathname}${input.url.search}`,
          method: 'GET',
          servername: input.url.hostname,
          lookup,
          agent: false,
          headers: {
            accept: 'application/octet-stream',
            'user-agent': 'SymbolWright-Dependency-Broker/1',
          },
        },
        (response) => {
          response.on('data', (chunk: Buffer) => {
            if (settled) return
            total += chunk.byteLength
            if (total > input.maxBytes) {
              fail(
                new DependencyFetchError(
                  'DEPENDENCY_RESPONSE_QUOTA_EXCEEDED',
                  `Dependency response exceeded ${input.maxBytes} bytes.`,
                ),
              )
              request.destroy()
              return
            }
            chunks.push(chunk)
          })
          response.once('end', () => {
            if (settled) return
            settled = true
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: normalizeHeaders(response.headers),
              body: Buffer.concat(chunks),
            })
          })
          response.once('error', fail)
        },
      )
      const timeout = setTimeout(() => {
        fail(
          new DependencyFetchError(
            'DEPENDENCY_FETCH_TIMEOUT',
            'Dependency HTTPS request exceeded the effective timeout.',
          ),
        )
        request.destroy()
      }, input.timeoutMs)
      timeout.unref()

      const onAbort = (): void => {
        fail(new DependencyFetchError('DEPENDENCY_FETCH_CANCELLED', 'Dependency fetch cancelled.'))
        request.destroy()
      }
      input.signal?.addEventListener('abort', onAbort, { once: true })
      request.once('error', fail)
      request.once('close', () => {
        clearTimeout(timeout)
        input.signal?.removeEventListener('abort', onAbort)
      })
      request.end()

      function fail(error: unknown): void {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        input.signal?.removeEventListener('abort', onAbort)
        reject(
          error instanceof DependencyFetchError
            ? error
            : new DependencyFetchError(
                'DEPENDENCY_HTTPS_FAILED',
                `Dependency HTTPS request failed: ${errorMessage(error)}`,
              ),
        )
      }
    })
  }
}

function parseAuthorizedUrl(value: string, policy: EffectiveDependencyPolicy): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new DependencyFetchError('DEPENDENCY_URL_INVALID', 'Dependency URL is invalid.')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    isIP(parsed.hostname) !== 0 ||
    !isUrlAllowedByRegistryPolicy(parsed.toString(), policy.allowedRegistries)
  ) {
    throw new DependencyFetchError(
      'DEPENDENCY_URL_NOT_ALLOWED',
      'Dependency URL is outside the operator-owned HTTPS registry allowlist.',
    )
  }
  if (parsed.port.length > 0 && parsed.port !== '443') {
    throw new DependencyFetchError(
      'DEPENDENCY_PORT_NOT_ALLOWED',
      'Dependency acquisition permits HTTPS port 443 only.',
    )
  }
  parsed.hash = ''
  return parsed
}

function uniqueAddresses(
  values: readonly DependencyResolvedAddress[],
): readonly DependencyResolvedAddress[] {
  const map = new Map<string, DependencyResolvedAddress>()
  for (const value of values) map.set(`${value.family}:${value.address.toLowerCase()}`, value)
  return [...map.values()].sort((left, right) => {
    const family = left.family - right.family
    return family === 0 ? left.address.localeCompare(right.address) : family
  })
}

function firstHeader(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  return value?.[0]
}

function normalizeHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Readonly<Record<string, string | readonly string[] | undefined>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? Object.freeze([...value]) : value,
      ]),
    ),
  )
}

function assertNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DependencyFetchError('DEPENDENCY_FETCH_CANCELLED', 'Dependency fetch cancelled.')
  }
}

function ipv4MappedAddress(address: string): string | undefined {
  const lower = address.toLowerCase()
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower)?.[1]
  if (dotted !== undefined && isIP(dotted) === 4) return dotted
  const hexadecimal = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(lower)
  if (hexadecimal === null) return undefined
  const high = Number.parseInt(hexadecimal[1] ?? '', 16)
  const low = Number.parseInt(hexadecimal[2] ?? '', 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return undefined
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

function createIpv4BlockList(): BlockList {
  const list = new BlockList()
  for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const) {
    list.addSubnet(network, prefix, 'ipv4')
  }
  return list
}

function createIpv6BlockList(): BlockList {
  const list = new BlockList()
  for (const [network, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
    ['2001:db8::', 32],
  ] as const) {
    list.addSubnet(network, prefix, 'ipv6')
  }
  return list
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
