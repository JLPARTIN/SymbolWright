/**
 * Hard, non-overridable safety rails for outbound web access. These are not
 * policy controls — they hold regardless of web.mode or allowPrivateNetwork.
 */

/** Schemes web_fetch will ever request. Nothing else is negotiable. */
const SAFE_SCHEMES = new Set(['http:', 'https:'])

/** Returns true only for http/https URLs. file://, ftp://, data:, javascript: etc. are always rejected. */
export function isSafeUrlScheme(url: URL): boolean {
  return SAFE_SCHEMES.has(url.protocol)
}

function parseIPv4(hostname: string): readonly [number, number, number, number] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (match === null) return undefined

  const octets = match.slice(1, 5).map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined
  }
  return octets as unknown as [number, number, number, number]
}

function isPrivateIPv4(octets: readonly [number, number, number, number]): boolean {
  const [a, b] = octets

  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 0) return true // 0.0.0.0/8 ("this network" / unspecified)
  if (a === 10) return true // 10.0.0.0/8
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local, incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  return false
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::1') return true // loopback
  if (normalized === '::') return true // unspecified
  if (normalized.startsWith('fe80:')) return true // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // unique local fc00::/7
  return false
}

/**
 * Returns true for localhost, loopback, link-local (including the
 * 169.254.169.254 cloud metadata endpoint), and RFC1918 private ranges.
 */
export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.includes(':')) return isPrivateIPv6(host)

  const ipv4 = parseIPv4(host)
  if (ipv4 !== undefined) return isPrivateIPv4(ipv4)

  return false
}
