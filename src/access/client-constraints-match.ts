import type { ClientConstraints } from './access-types.js'

/**
 * IPv4-only CIDR matching (e.g. "10.0.0.0/8"). A pattern without a "/" is compared as an exact
 * string, which also covers IPv6 addresses and any other non-CIDR identifier — this deliberately
 * does not attempt IPv6 CIDR arithmetic.
 */
function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.')
  if (parts.length !== 4) return undefined
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    const octet = Number.parseInt(part, 10)
    if (octet < 0 || octet > 255) return undefined
    value = (value << 8) | octet
  }
  return value >>> 0
}

function matchesIpPattern(clientIp: string, pattern: string): boolean {
  const slashIndex = pattern.indexOf('/')
  if (slashIndex === -1) return clientIp === pattern

  const base = pattern.slice(0, slashIndex)
  const prefixLength = Number.parseInt(pattern.slice(slashIndex + 1), 10)
  const baseInt = ipv4ToInt(base)
  const clientInt = ipv4ToInt(clientIp)
  if (baseInt === undefined || clientInt === undefined) return false
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) return false
  if (prefixLength === 0) return true

  const mask = prefixLength === 32 ? 0xffffffff : (0xffffffff << (32 - prefixLength)) >>> 0
  return (baseInt & mask) === (clientInt & mask)
}

export interface ClientContext {
  readonly ip?: string
  readonly clientId?: string
}

/**
 * Returns the reason the request violates `constraints`, or `undefined` when it satisfies them
 * (including when `constraints` is absent, or a given constraint list is empty/unset).
 */
export function checkClientConstraints(
  context: ClientContext,
  constraints: ClientConstraints | undefined,
): string | undefined {
  if (constraints === undefined) return undefined

  const allowedIpCidrs = constraints.allowedIpCidrs
  if (allowedIpCidrs !== undefined && allowedIpCidrs.length > 0) {
    if (
      context.ip === undefined ||
      !allowedIpCidrs.some((pattern) => matchesIpPattern(context.ip as string, pattern))
    ) {
      return `Client IP "${context.ip ?? 'unknown'}" is not in this grant's allowed IP list.`
    }
  }

  const allowedClientIds = constraints.allowedClientIds
  if (allowedClientIds !== undefined && allowedClientIds.length > 0) {
    if (context.clientId === undefined || !allowedClientIds.includes(context.clientId)) {
      return `Client id "${context.clientId ?? 'unknown'}" is not in this grant's allowed client list.`
    }
  }

  return undefined
}
