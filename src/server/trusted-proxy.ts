import { isIP } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'

export class TrustedProxyConfigError extends Error {}

export interface ParsedCidr {
  readonly source: string
  readonly family: 4 | 6
  readonly network: bigint
  readonly prefixLength: number
}

export interface RequestSecurityConfig {
  readonly deploymentMode: 'local' | 'hosted'
  readonly directTls: boolean
  readonly trustedProxyCidrs: readonly ParsedCidr[]
}

export interface RequestSecurityRejection {
  readonly statusCode: 400 | 403
  readonly code:
    | 'untrusted_proxy_peer'
    | 'forwarded_protocol_missing'
    | 'forwarded_protocol_invalid'
    | 'forwarded_protocol_conflict'
    | 'forwarded_for_invalid'
    | 'direct_tls_required'
  readonly message: string
}

export interface RequestSecurityResolution {
  readonly immediatePeerIp: string
  readonly clientIp: string
  readonly secure: boolean
  readonly viaTrustedProxy: boolean
  readonly rejection?: RequestSecurityRejection
}

const REQUEST_SECURITY = Symbol.for('symbolwright.request-security')

function stripOptionalPort(value: string): string {
  if (value.startsWith('[')) {
    const closing = value.indexOf(']')
    if (closing > 0) return value.slice(1, closing)
  }
  const colonCount = [...value].filter((character) => character === ':').length
  if (colonCount === 1) {
    const [host, port] = value.split(':')
    if (host !== undefined && port !== undefined && /^\d+$/.test(port) && isIP(host) === 4) {
      return host
    }
  }
  return value
}

export function normalizeIpAddress(input: string): string {
  let value = input.trim()
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
  value = stripOptionalPort(value)
  const zoneIndex = value.indexOf('%')
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex)
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped?.[1] !== undefined && isIP(mapped[1]) === 4) return mapped[1]
  return value.toLowerCase()
}

function ipv4ToBigInt(value: string): bigint {
  const parts = value.split('.').map((part) => Number.parseInt(part, 10))
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new TrustedProxyConfigError(`Invalid IPv4 address: ${value}`)
  }
  return parts.reduce((result, part) => (result << 8n) | BigInt(part), 0n)
}

function expandIpv6(value: string): readonly number[] {
  let normalized = value
  const ipv4Tail = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4Tail?.[1] !== undefined) {
    const ipv4 = ipv4ToBigInt(ipv4Tail[1])
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16)
    const low = Number(ipv4 & 0xffffn).toString(16)
    normalized = normalized.slice(0, -ipv4Tail[1].length) + `${high}:${low}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) throw new TrustedProxyConfigError(`Invalid IPv6 address: ${value}`)
  const left = halves[0] === '' ? [] : (halves[0] ?? '').split(':')
  const right = halves.length === 1 || halves[1] === '' ? [] : (halves[1] ?? '').split(':')
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    throw new TrustedProxyConfigError(`Invalid IPv6 address: ${value}`)
  }
  const words = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (words.length !== 8) throw new TrustedProxyConfigError(`Invalid IPv6 address: ${value}`)
  return words.map((word) => {
    if (!/^[0-9a-f]{1,4}$/i.test(word)) {
      throw new TrustedProxyConfigError(`Invalid IPv6 address: ${value}`)
    }
    return Number.parseInt(word, 16)
  })
}

function ipv6ToBigInt(value: string): bigint {
  return expandIpv6(value).reduce((result, word) => (result << 16n) | BigInt(word), 0n)
}

function ipToBigInt(value: string, family: 4 | 6): bigint {
  return family === 4 ? ipv4ToBigInt(value) : ipv6ToBigInt(value)
}

function cidrMask(bits: number, prefixLength: number): bigint {
  if (prefixLength === 0) return 0n
  return ((1n << BigInt(prefixLength)) - 1n) << BigInt(bits - prefixLength)
}

export function parseTrustedProxyCidrs(
  values: string | readonly string[] | undefined,
): readonly ParsedCidr[] {
  const entries =
    values === undefined
      ? []
      : (typeof values === 'string' ? values.split(',') : values)
          .map((entry) => entry.trim())
          .filter(Boolean)

  return entries.map((entry) => {
    const [rawAddress, rawPrefix] = entry.split('/')
    if (rawAddress === undefined || entry.split('/').length > 2) {
      throw new TrustedProxyConfigError(`Malformed trusted-proxy CIDR: ${entry}`)
    }
    const address = normalizeIpAddress(rawAddress)
    const detected = isIP(address)
    if (detected !== 4 && detected !== 6) {
      throw new TrustedProxyConfigError(`Malformed trusted-proxy CIDR: ${entry}`)
    }
    const family = detected
    const bits = family === 4 ? 32 : 128
    if (rawPrefix !== undefined && !/^(0|[1-9]\d*)$/.test(rawPrefix)) {
      throw new TrustedProxyConfigError(`Malformed trusted-proxy CIDR prefix: ${entry}`)
    }
    const prefixLength = rawPrefix === undefined ? bits : Number(rawPrefix)
    if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > bits) {
      throw new TrustedProxyConfigError(`Malformed trusted-proxy CIDR prefix: ${entry}`)
    }
    const mask = cidrMask(bits, prefixLength)
    return {
      source: entry,
      family,
      network: ipToBigInt(address, family) & mask,
      prefixLength,
    }
  })
}

export function ipMatchesCidr(address: string, cidr: ParsedCidr): boolean {
  const normalized = normalizeIpAddress(address)
  const detected = isIP(normalized)
  if (detected !== cidr.family) return false
  const bits = detected === 4 ? 32 : 128
  const mask = cidrMask(bits, cidr.prefixLength)
  return (ipToBigInt(normalized, detected) & mask) === cidr.network
}

function isTrusted(address: string, cidrs: readonly ParsedCidr[]): boolean {
  return cidrs.some((cidr) => ipMatchesCidr(address, cidr))
}

function headerValue(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : value.join(',')
}

function parseRightmostForwardedProto(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const rightmost = value.split(',').at(-1)?.trim()
  if (rightmost === undefined || rightmost.length === 0) return undefined
  const protoPart = rightmost
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('proto='))
  if (protoPart === undefined) return undefined
  const proto = protoPart.slice('proto='.length).trim().replace(/^"|"$/g, '').toLowerCase()
  return proto
}

function parseRightmostXForwardedProto(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return value.split(',').at(-1)?.trim().toLowerCase()
}

function resolveForwardedProtocol(
  req: IncomingMessage,
): { readonly protocol: 'https' } | { readonly rejection: RequestSecurityRejection } {
  const forwarded = parseRightmostForwardedProto(headerValue(req.headers.forwarded))
  const xForwarded = parseRightmostXForwardedProto(headerValue(req.headers['x-forwarded-proto']))

  for (const value of [forwarded, xForwarded]) {
    if (value !== undefined && value !== 'http' && value !== 'https') {
      return {
        rejection: {
          statusCode: 400,
          code: 'forwarded_protocol_invalid',
          message: 'Forwarded protocol must be exactly http or https.',
        },
      }
    }
  }
  if (forwarded !== undefined && xForwarded !== undefined && forwarded !== xForwarded) {
    return {
      rejection: {
        statusCode: 400,
        code: 'forwarded_protocol_conflict',
        message: 'Forwarded and X-Forwarded-Proto disagree for the immediate trusted proxy.',
      },
    }
  }
  const protocol = forwarded ?? xForwarded
  if (protocol === undefined) {
    return {
      rejection: {
        statusCode: 400,
        code: 'forwarded_protocol_missing',
        message: 'Trusted-proxy mode requires a forwarded proto=https value.',
      },
    }
  }
  if (protocol !== 'https') {
    return {
      rejection: {
        statusCode: 403,
        code: 'forwarded_protocol_invalid',
        message: 'Trusted-proxy mode only accepts requests forwarded from HTTPS.',
      },
    }
  }
  return { protocol: 'https' }
}

function resolveForwardedClientIp(
  req: IncomingMessage,
  immediatePeerIp: string,
  cidrs: readonly ParsedCidr[],
): { readonly clientIp: string } | { readonly rejection: RequestSecurityRejection } {
  const raw = headerValue(req.headers['x-forwarded-for'])
  if (raw === undefined || raw.trim().length === 0) return { clientIp: immediatePeerIp }
  const hops: string[] = []
  for (const entry of raw.split(',')) {
    const normalized = normalizeIpAddress(entry)
    if (isIP(normalized) === 0) {
      return {
        rejection: {
          statusCode: 400,
          code: 'forwarded_for_invalid',
          message: 'X-Forwarded-For contains a malformed address.',
        },
      }
    }
    hops.push(normalized)
  }

  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index]
    if (hop !== undefined && !isTrusted(hop, cidrs)) return { clientIp: hop }
  }
  return { clientIp: hops[0] ?? immediatePeerIp }
}

export function resolveRequestSecurity(
  req: IncomingMessage,
  config: RequestSecurityConfig,
): RequestSecurityResolution {
  const cached = (req as IncomingMessage & { [REQUEST_SECURITY]?: RequestSecurityResolution })[
    REQUEST_SECURITY
  ]
  if (cached !== undefined) return cached

  const rawPeer = req.socket.remoteAddress ?? 'unknown'
  const immediatePeerIp = normalizeIpAddress(rawPeer)
  const peerValid = isIP(immediatePeerIp) !== 0
  let resolution: RequestSecurityResolution

  if (config.trustedProxyCidrs.length > 0) {
    if (!peerValid || !isTrusted(immediatePeerIp, config.trustedProxyCidrs)) {
      resolution = {
        immediatePeerIp,
        clientIp: immediatePeerIp,
        secure: false,
        viaTrustedProxy: false,
        rejection: {
          statusCode: 403,
          code: 'untrusted_proxy_peer',
          message: 'Trusted-proxy mode rejects direct connections from untrusted peers.',
        },
      }
    } else {
      const protocol = resolveForwardedProtocol(req)
      if ('rejection' in protocol) {
        resolution = {
          immediatePeerIp,
          clientIp: immediatePeerIp,
          secure: false,
          viaTrustedProxy: true,
          rejection: protocol.rejection,
        }
      } else {
        const forwardedClient = resolveForwardedClientIp(
          req,
          immediatePeerIp,
          config.trustedProxyCidrs,
        )
        if ('rejection' in forwardedClient) {
          resolution = {
            immediatePeerIp,
            clientIp: immediatePeerIp,
            secure: false,
            viaTrustedProxy: true,
            rejection: forwardedClient.rejection,
          }
        } else {
          resolution = {
            immediatePeerIp,
            clientIp: forwardedClient.clientIp,
            secure: true,
            viaTrustedProxy: true,
          }
        }
      }
    }
  } else {
    const encrypted = (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted === true
    if (config.directTls && !encrypted) {
      resolution = {
        immediatePeerIp,
        clientIp: immediatePeerIp,
        secure: false,
        viaTrustedProxy: false,
        rejection: {
          statusCode: 403,
          code: 'direct_tls_required',
          message: 'This server is configured for direct TLS and rejected a plaintext request.',
        },
      }
    } else {
      resolution = {
        immediatePeerIp,
        clientIp: immediatePeerIp,
        secure: encrypted || config.directTls,
        viaTrustedProxy: false,
      }
    }
  }

  ;(req as IncomingMessage & { [REQUEST_SECURITY]?: RequestSecurityResolution })[REQUEST_SECURITY] =
    resolution
  return resolution
}

export function sendRequestSecurityRejection(
  res: ServerResponse,
  rejection: RequestSecurityRejection,
): void {
  res.writeHead(rejection.statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: rejection.code, message: rejection.message }))
}

export function applyOperationalSecurityHeaders(res: ServerResponse): void {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
}
