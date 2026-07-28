import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

function write(relative, content) {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`)
}

function replace(relative, before, after) {
  const current = read(relative)
  if (!current.includes(before)) {
    throw new Error(`Anchor not found in ${relative}: ${before.slice(0, 160)}`)
  }
  write(relative, current.replace(before, after))
}

write(
  'src/server/trusted-proxy.ts',
  String.raw`import { isIP } from 'node:net'
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
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
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
      : (typeof values === 'string' ? values.split(',') : values).map((entry) => entry.trim()).filter(Boolean)

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
    const prefixLength = rawPrefix === undefined ? bits : Number.parseInt(rawPrefix, 10)
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
  return Array.isArray(value) ? value.join(',') : value
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

function resolveForwardedProtocol(req: IncomingMessage):
  | { readonly protocol: 'https' }
  | { readonly rejection: RequestSecurityRejection } {
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
`,
)

write(
  'src/server/deployment-mode.ts',
  String.raw`import { parseTrustedProxyCidrs, type ParsedCidr } from './trusted-proxy.js'

export type SymbolWrightDeploymentMode = 'local' | 'hosted'

export class DeploymentConfigError extends Error {}

export interface DeploymentSecurityOptions {
  readonly host?: string
  readonly deploymentMode?: SymbolWrightDeploymentMode
  readonly tlsCertFile?: string
  readonly tlsKeyFile?: string
  readonly trustedProxyCidrs?: readonly string[]
  readonly allowUnencryptedNonLoopback?: boolean
  readonly maxProviderConcurrency?: number
  readonly maxSseStreams?: number
  readonly maxAutonomousExecutions?: number
}

export interface ResolvedDeploymentSecurity {
  readonly deploymentMode: SymbolWrightDeploymentMode
  readonly directTls: boolean
  readonly trustedProxyCidrs: readonly ParsedCidr[]
  readonly trustedProxyCidrSources: readonly string[]
  readonly allowUnencryptedNonLoopback: boolean
  readonly maxProviderConcurrency?: number
  readonly maxSseStreams?: number
  readonly maxAutonomousExecutions?: number
  readonly warnings: readonly string[]
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.')
}

function positiveInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1) {
    throw new DeploymentConfigError(`${name} must be a positive integer.`)
  }
  return value
}

export function resolveDeploymentSecurity(
  options: DeploymentSecurityOptions,
): ResolvedDeploymentSecurity {
  const deploymentMode = options.deploymentMode ?? 'local'
  if (deploymentMode !== 'local' && deploymentMode !== 'hosted') {
    throw new DeploymentConfigError(
      `SYMBOLWRIGHT_DEPLOYMENT_MODE must be "local" or "hosted", received ${String(deploymentMode)}.`,
    )
  }

  const hasCert = options.tlsCertFile !== undefined
  const hasKey = options.tlsKeyFile !== undefined
  if (hasCert !== hasKey) {
    throw new DeploymentConfigError(
      'Direct TLS requires both SYMBOLWRIGHT_TLS_CERT_FILE and SYMBOLWRIGHT_TLS_KEY_FILE.',
    )
  }
  const directTls = hasCert && hasKey
  const trustedProxyCidrs = parseTrustedProxyCidrs(options.trustedProxyCidrs)
  const proxyMode = trustedProxyCidrs.length > 0
  if (directTls && proxyMode) {
    throw new DeploymentConfigError(
      'Choose exactly one network-termination mode: direct TLS or trusted reverse proxy, not both.',
    )
  }

  const host = options.host ?? '127.0.0.1'
  const allowUnencryptedNonLoopback = options.allowUnencryptedNonLoopback === true
  const maxProviderConcurrency = positiveInteger(
    options.maxProviderConcurrency,
    'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY',
  )
  const maxSseStreams = positiveInteger(options.maxSseStreams, 'SYMBOLWRIGHT_MAX_SSE_STREAMS')
  const maxAutonomousExecutions = positiveInteger(
    options.maxAutonomousExecutions,
    'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS',
  )

  const warnings: string[] = []
  if (deploymentMode === 'hosted') {
    if (allowUnencryptedNonLoopback) {
      throw new DeploymentConfigError(
        'SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK is a local-development escape hatch and is forbidden in hosted mode.',
      )
    }
    if (!directTls && !proxyMode) {
      throw new DeploymentConfigError(
        'Hosted mode requires direct TLS or SYMBOLWRIGHT_TRUSTED_PROXY_CIDRS with verified forwarded HTTPS.',
      )
    }
    const missing = [
      maxProviderConcurrency === undefined ? 'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY' : undefined,
      maxSseStreams === undefined ? 'SYMBOLWRIGHT_MAX_SSE_STREAMS' : undefined,
      maxAutonomousExecutions === undefined
        ? 'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS'
        : undefined,
    ].filter((value): value is string => value !== undefined)
    if (missing.length > 0) {
      throw new DeploymentConfigError(
        `Hosted mode requires explicit process-local concurrency caps: ${missing.join(', ')}.`,
      )
    }
  } else if (!isLoopbackHost(host) && !directTls && !proxyMode) {
    if (!allowUnencryptedNonLoopback) {
      throw new DeploymentConfigError(
        'Refusing non-loopback plaintext binding. Configure direct TLS, trusted-proxy mode, or explicitly set SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK=true for local development only.',
      )
    }
    warnings.push(
      'Development escape hatch enabled: non-loopback plaintext HTTP is allowed in local mode. Do not expose this process publicly.',
    )
  }

  return {
    deploymentMode,
    directTls,
    trustedProxyCidrs,
    trustedProxyCidrSources: trustedProxyCidrs.map((cidr) => cidr.source),
    allowUnencryptedNonLoopback,
    ...(maxProviderConcurrency === undefined ? {} : { maxProviderConcurrency }),
    ...(maxSseStreams === undefined ? {} : { maxSseStreams }),
    ...(maxAutonomousExecutions === undefined ? {} : { maxAutonomousExecutions }),
    warnings,
  }
}
`,
)

write(
  'src/access/hosted-limit-policy.ts',
  String.raw`import type {
  AgentAccessGrant,
  MissionExecutionLimits,
  SessionLimits,
} from './access-types.js'

const REQUIRED_EXECUTION_LIMITS = [
  'maxConcurrentMissions',
  'maxMissionDurationMinutes',
  'maxRepairAttempts',
  'maxFilesChanged',
  'maxDiffLines',
  'maxCommits',
  'maxDailyEstimatedCostUsd',
] as const

const REQUIRED_SESSION_LIMITS = [
  'maxConcurrentSessions',
  'maxSessionDurationMinutes',
  'inactivityTimeoutMinutes',
] as const

export function missingHostedDelegatedLimits(
  executionLimits: MissionExecutionLimits | undefined,
  sessionLimits: SessionLimits | undefined,
): readonly string[] {
  const missing: string[] = []
  for (const key of REQUIRED_EXECUTION_LIMITS) {
    if (executionLimits?.[key] === undefined) missing.push(`executionLimits.${key}`)
  }
  for (const key of REQUIRED_SESSION_LIMITS) {
    if (sessionLimits?.[key] === undefined) missing.push(`sessionLimits.${key}`)
  }
  return missing
}

export function grantMissingHostedDelegatedLimits(grant: AgentAccessGrant): readonly string[] {
  if (grant.status !== 'active' && grant.status !== 'pending' && grant.status !== 'paused') return []
  return missingHostedDelegatedLimits(grant.executionLimits, grant.sessionLimits)
}
`,
)

write(
  'src/server/metrics-registry.ts',
  String.raw`import type { IncomingMessage, ServerResponse } from 'node:http'

export interface MetricsSnapshot {
  readonly generatedAt: string
  readonly counters: Readonly<Record<string, number>>
  readonly gauges: Readonly<Record<string, number>>
}

export class MetricsRegistry {
  readonly #counters = new Map<string, number>()
  readonly #gauges = new Map<string, number>()
  readonly #tracked = new WeakSet<IncomingMessage>()

  public increment(name: string, amount = 1): void {
    this.#counters.set(name, (this.#counters.get(name) ?? 0) + amount)
  }

  public setGauge(name: string, value: number): void {
    this.#gauges.set(name, value)
  }

  public trackResponse(req: IncomingMessage, res: ServerResponse): void {
    if (this.#tracked.has(req)) return
    this.#tracked.add(req)
    this.increment('http_requests_total')
    this.setGauge('http_requests_active', (this.#gauges.get('http_requests_active') ?? 0) + 1)
    res.once('finish', () => {
      this.setGauge('http_requests_active', Math.max(0, (this.#gauges.get('http_requests_active') ?? 1) - 1))
      const bucket = Math.floor(res.statusCode / 100)
      if (bucket >= 1 && bucket <= 5) this.increment(`http_responses_${bucket}xx_total`)
      if (res.statusCode === 401) this.increment('http_authentication_failures_total')
      if (res.statusCode === 403) this.increment('http_authorization_denials_total')
      if (res.statusCode === 429) this.increment('http_rate_or_concurrency_limited_total')
      if (res.statusCode >= 500) this.increment('http_server_errors_total')
    })
  }

  public snapshot(): MetricsSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      counters: Object.fromEntries([...this.#counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      gauges: Object.fromEntries([...this.#gauges.entries()].sort(([a], [b]) => a.localeCompare(b))),
    }
  }
}
`,
)

write(
  'src/server/readiness-registry.ts',
  String.raw`export interface ReadinessCheck {
  readonly ready: boolean
  readonly detail?: string
}

export interface ReadinessDetailSnapshot {
  readonly ready: boolean
  readonly checkedAt: string
  readonly checks: Readonly<Record<string, ReadinessCheck>>
}

export class ReadinessRegistry {
  readonly #checks = new Map<string, ReadinessCheck>([['process', { ready: true }]])

  public setCheck(name: string, ready: boolean, detail?: string): void {
    this.#checks.set(name, { ready, ...(detail === undefined ? {} : { detail }) })
  }

  public isReady(): boolean {
    return [...this.#checks.values()].every((check) => check.ready)
  }

  public publicSnapshot(): { readonly ready: boolean } {
    return { ready: this.isReady() }
  }

  public detailedSnapshot(): ReadinessDetailSnapshot {
    return {
      ready: this.isReady(),
      checkedAt: new Date().toISOString(),
      checks: Object.fromEntries([...this.#checks.entries()].sort(([a], [b]) => a.localeCompare(b))),
    }
  }
}
`,
)

write(
  'src/server/boot-sweep.ts',
  String.raw`import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { pruneAcquisitionRoot } from '../github/repository-acquisition-retention.js'
import type { MissionService } from '../mission/mission-service.js'
import type { ReadinessRegistry } from './readiness-registry.js'

export interface BootSweepLogger {
  warn(message: string): void
  info(message: string): void
}

export interface BootSweepOptions {
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly readiness: ReadinessRegistry
  readonly staleActiveAfterMs?: number
  readonly now?: () => Date
  readonly logger?: BootSweepLogger
}

export interface BootSweepReport {
  readonly missionStoreHealthy: boolean
  readonly staleActiveMissionIds: readonly string[]
  readonly warnings: readonly string[]
  readonly retention: {
    readonly quarantined: number
    readonly deleted: number
    readonly restored: number
  }
}

const DEFAULT_STALE_ACTIVE_AFTER_MS = 30 * 60 * 1000

export async function runBootSweep(options: BootSweepOptions): Promise<BootSweepReport> {
  const now = options.now ?? (() => new Date())
  const logger = options.logger ?? console
  const warnings: string[] = []
  const staleActiveMissionIds: string[] = []
  let missionStoreHealthy = true

  try {
    let offset = 0
    const pageSize = 200
    for (;;) {
      const page = options.missionService.list({ offset, limit: pageSize })
      if (page.warnings.some((warning) => warning.code === 'CORRUPT_RECORD')) {
        missionStoreHealthy = false
      }
      for (const warning of page.warnings) warnings.push(warning.message)
      for (const mission of page.missions) {
        if (
          mission.status === 'ACTIVE' &&
          now().getTime() - new Date(mission.updatedAt).getTime() >=
            (options.staleActiveAfterMs ?? DEFAULT_STALE_ACTIVE_AFTER_MS)
        ) {
          staleActiveMissionIds.push(mission.id)
        }
      }
      offset += page.missions.length
      if (page.missions.length === 0 || offset >= page.total) break
    }
  } catch (error) {
    missionStoreHealthy = false
    warnings.push(
      `Mission-store boot sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const sandboxIndex = path.join(
    path.resolve(options.workspaceRoot),
    '.symbolwright',
    'sandbox',
    'index.json',
  )
  if (existsSync(sandboxIndex)) {
    try {
      JSON.parse(readFileSync(sandboxIndex, 'utf8'))
    } catch (error) {
      warnings.push(
        `Sandbox history index is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  let retention = { quarantined: 0, deleted: 0, restored: 0 }
  try {
    const result = await pruneAcquisitionRoot({
      workspaceRoot: options.workspaceRoot,
      missionService: options.missionService,
    })
    retention = {
      quarantined: result.quarantined.length,
      deleted: result.deleted.length,
      restored: result.restored.length,
    }
  } catch (error) {
    warnings.push(
      `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  options.readiness.setCheck(
    'mission_store',
    missionStoreHealthy,
    missionStoreHealthy ? undefined : 'One or more mission records are unreadable.',
  )
  options.readiness.setCheck('boot_sweep', true)

  for (const missionId of staleActiveMissionIds) {
    logger.warn(
      `Boot sweep detected stale ACTIVE mission ${missionId}; it was not auto-resumed or mutated.`,
    )
  }
  for (const warning of warnings) logger.warn(warning)
  if (retention.quarantined + retention.deleted + retention.restored > 0) {
    logger.info(
      `Boot sweep retention: quarantined=${retention.quarantined}, deleted=${retention.deleted}, restored=${retention.restored}.`,
    )
  }

  return { missionStoreHealthy, staleActiveMissionIds, warnings, retention }
}
`,
)

write(
  'src/server/operational-bootstrap.ts',
  String.raw`import { AccessRuntime } from '../access/access-runtime.js'
import { GovernanceStore, resolveGovernanceStorePath } from '../access/governance-store.js'
import { grantMissingHostedDelegatedLimits } from '../access/hosted-limit-policy.js'
import { ProviderConcurrencyGuard } from '../access/provider-concurrency-guard.js'
import { MissionService } from '../mission/mission-service.js'
import type { ChatServerOptions } from './symbolwright-chat-server.js'
import { runBootSweep } from './boot-sweep.js'
import { DeploymentConfigError, resolveDeploymentSecurity } from './deployment-mode.js'
import { MetricsRegistry } from './metrics-registry.js'
import { ReadinessRegistry } from './readiness-registry.js'

export interface PreparedOperationalServer {
  readonly options: ChatServerOptions
  readonly warnings: readonly string[]
}

export async function prepareOperationalServerOptions(
  options: ChatServerOptions,
): Promise<PreparedOperationalServer> {
  const security = resolveDeploymentSecurity(options)
  const workspaceRoot = options.cwd ?? process.cwd()
  const missionService = options.missionService ?? new MissionService({ workspaceRoot, env: options.env })
  const accessRuntime = options.accessRuntime ?? new AccessRuntime({ workspaceRoot })
  const readinessRegistry = options.readinessRegistry ?? new ReadinessRegistry()
  const metricsRegistry = options.metricsRegistry ?? new MetricsRegistry()
  const concurrencyGuard = options.concurrencyGuard ?? new ProviderConcurrencyGuard()

  if (security.maxProviderConcurrency !== undefined) {
    concurrencyGuard.configurePool('provider', security.maxProviderConcurrency)
  }
  if (security.maxSseStreams !== undefined) {
    concurrencyGuard.configurePool('sse', security.maxSseStreams)
  }
  if (security.maxAutonomousExecutions !== undefined) {
    concurrencyGuard.configurePool('autonomous', security.maxAutonomousExecutions)
  }

  let governanceStore = options.governanceStore
  if (security.deploymentMode === 'hosted') {
    governanceStore ??= new GovernanceStore(resolveGovernanceStorePath(workspaceRoot))
    governanceStore.settleExpiredReservations()
    readinessRegistry.setCheck('governance_store', true)

    const invalid = accessRuntime.grantService
      .listGrants()
      .map((grant) => ({ grant, missing: grantMissingHostedDelegatedLimits(grant) }))
      .filter((entry) => entry.missing.length > 0)
    if (invalid.length > 0) {
      const detail = invalid
        .map((entry) => `${entry.grant.id}: ${entry.missing.join(', ')}`)
        .join('; ')
      governanceStore.close()
      throw new DeploymentConfigError(
        `Hosted mode refuses to start while delegated grants lack mandatory limits: ${detail}`,
      )
    }
  }

  await runBootSweep({ workspaceRoot, missionService, readiness: readinessRegistry })

  return {
    options: {
      ...options,
      deploymentMode: security.deploymentMode,
      trustedProxyCidrs: security.trustedProxyCidrSources,
      allowUnencryptedNonLoopback: security.allowUnencryptedNonLoopback,
      missionService,
      accessRuntime,
      readinessRegistry,
      metricsRegistry,
      concurrencyGuard,
      ...(governanceStore === undefined ? {} : { governanceStore }),
    },
    warnings: security.warnings,
  }
}
`,
)

write(
  'src/server/trusted-proxy.spec.ts',
  String.raw`import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'

import {
  normalizeIpAddress,
  parseTrustedProxyCidrs,
  resolveRequestSecurity,
  TrustedProxyConfigError,
} from './trusted-proxy.js'

function request(
  remoteAddress: string,
  headers: Record<string, string> = {},
  encrypted = false,
): IncomingMessage {
  const socket = Object.assign(new EventEmitter(), { remoteAddress, encrypted })
  return { socket, headers } as unknown as IncomingMessage
}

describe('trusted proxy resolution', () => {
  it('normalizes IPv4-mapped IPv6 addresses before CIDR matching', () => {
    expect(normalizeIpAddress('::ffff:127.0.0.1')).toBe('127.0.0.1')
    const result = resolveRequestSecurity(
      request('::ffff:127.0.0.1', {
        'x-forwarded-for': '203.0.113.8',
        'x-forwarded-proto': 'https',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['127.0.0.0/8']),
      },
    )
    expect(result.rejection).toBeUndefined()
    expect(result.clientIp).toBe('203.0.113.8')
  })

  it('ignores spoofed forwarded headers from an untrusted peer by rejecting the peer', () => {
    const result = resolveRequestSecurity(
      request('203.0.113.99', {
        'x-forwarded-for': '10.0.0.1',
        'x-forwarded-proto': 'https',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['127.0.0.0/8']),
      },
    )
    expect(result.rejection?.code).toBe('untrusted_proxy_peer')
  })

  it('selects the first untrusted hop while walking XFF right-to-left', () => {
    const result = resolveRequestSecurity(
      request('10.0.0.5', {
        'x-forwarded-for': '198.51.100.7, 10.0.0.4',
        'x-forwarded-proto': 'https',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['10.0.0.0/8']),
      },
    )
    expect(result.clientIp).toBe('198.51.100.7')
  })

  it('uses the rightmost proxy-owned protocol value, not any https substring', () => {
    const result = resolveRequestSecurity(
      request('10.0.0.5', {
        forwarded: 'for=client;proto=https, for=proxy;proto=http',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['10.0.0.0/8']),
      },
    )
    expect(result.rejection?.code).toBe('forwarded_protocol_invalid')
  })

  it('rejects disagreement between Forwarded and X-Forwarded-Proto', () => {
    const result = resolveRequestSecurity(
      request('10.0.0.5', {
        forwarded: 'for=proxy;proto=https',
        'x-forwarded-proto': 'http, http',
      }),
      {
        deploymentMode: 'hosted',
        directTls: false,
        trustedProxyCidrs: parseTrustedProxyCidrs(['10.0.0.0/8']),
      },
    )
    expect(result.rejection?.code).toBe('forwarded_protocol_conflict')
  })

  it('fails startup parsing on malformed CIDRs', () => {
    expect(() => parseTrustedProxyCidrs(['10.0.0.0/99'])).toThrow(TrustedProxyConfigError)
    expect(() => parseTrustedProxyCidrs(['not-an-ip'])).toThrow(TrustedProxyConfigError)
  })
})
`,
)

write(
  'src/server/deployment-mode.spec.ts',
  String.raw`import { describe, expect, it } from 'vitest'

import { DeploymentConfigError, resolveDeploymentSecurity } from './deployment-mode.js'

describe('deployment mode', () => {
  it('keeps loopback local mode zero-config', () => {
    expect(resolveDeploymentSecurity({ host: '127.0.0.1' }).deploymentMode).toBe('local')
  })

  it('fails closed for non-loopback plaintext local binding without the escape hatch', () => {
    expect(() => resolveDeploymentSecurity({ host: '0.0.0.0' })).toThrow(DeploymentConfigError)
  })

  it('allows the non-loopback plaintext escape hatch only in local mode and emits a warning', () => {
    const result = resolveDeploymentSecurity({
      host: '0.0.0.0',
      deploymentMode: 'local',
      allowUnencryptedNonLoopback: true,
    })
    expect(result.warnings).toHaveLength(1)
  })

  it('requires real TLS or trusted proxy plus explicit concurrency caps in hosted mode', () => {
    expect(() =>
      resolveDeploymentSecurity({ host: '0.0.0.0', deploymentMode: 'hosted' }),
    ).toThrow(DeploymentConfigError)
    expect(() =>
      resolveDeploymentSecurity({
        host: '0.0.0.0',
        deploymentMode: 'hosted',
        trustedProxyCidrs: ['127.0.0.1/32'],
      }),
    ).toThrow(/concurrency caps/)
  })

  it('accepts a fully specified hosted trusted-proxy topology', () => {
    const result = resolveDeploymentSecurity({
      host: '127.0.0.1',
      deploymentMode: 'hosted',
      trustedProxyCidrs: ['127.0.0.1/32'],
      maxProviderConcurrency: 4,
      maxSseStreams: 2,
      maxAutonomousExecutions: 1,
    })
    expect(result.trustedProxyCidrs).toHaveLength(1)
  })

  it('forbids the plaintext escape hatch in hosted mode', () => {
    expect(() =>
      resolveDeploymentSecurity({
        deploymentMode: 'hosted',
        trustedProxyCidrs: ['127.0.0.1/32'],
        allowUnencryptedNonLoopback: true,
        maxProviderConcurrency: 1,
        maxSseStreams: 1,
        maxAutonomousExecutions: 1,
      }),
    ).toThrow(/forbidden/)
  })
})
`,
)

write(
  'src/access/hosted-limit-policy.spec.ts',
  String.raw`import { describe, expect, it } from 'vitest'

import { missingHostedDelegatedLimits } from './hosted-limit-policy.js'

describe('hosted delegated limit policy', () => {
  it('reports every missing mandatory limit', () => {
    expect(missingHostedDelegatedLimits(undefined, undefined)).toContain(
      'executionLimits.maxDailyEstimatedCostUsd',
    )
    expect(missingHostedDelegatedLimits(undefined, undefined)).toContain(
      'sessionLimits.maxConcurrentSessions',
    )
  })

  it('accepts a fully explicit limit set including a zero-dollar budget', () => {
    expect(
      missingHostedDelegatedLimits(
        {
          maxConcurrentMissions: 1,
          maxMissionDurationMinutes: 30,
          maxRepairAttempts: 2,
          maxFilesChanged: 20,
          maxDiffLines: 500,
          maxCommits: 3,
          maxDailyEstimatedCostUsd: 0,
        },
        {
          maxConcurrentSessions: 1,
          maxSessionDurationMinutes: 60,
          inactivityTimeoutMinutes: 10,
        },
      ),
    ).toEqual([])
  })
})
`,
)

write(
  'src/server/metrics-registry.spec.ts',
  String.raw`import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import { MetricsRegistry } from './metrics-registry.js'

describe('MetricsRegistry', () => {
  it('tracks each request once and records response classes', () => {
    const registry = new MetricsRegistry()
    const req = {} as IncomingMessage
    const res = Object.assign(new EventEmitter(), { statusCode: 429 }) as unknown as ServerResponse
    registry.trackResponse(req, res)
    registry.trackResponse(req, res)
    res.emit('finish')
    const snapshot = registry.snapshot()
    expect(snapshot.counters.http_requests_total).toBe(1)
    expect(snapshot.counters.http_responses_4xx_total).toBe(1)
    expect(snapshot.counters.http_rate_or_concurrency_limited_total).toBe(1)
    expect(snapshot.gauges.http_requests_active).toBe(0)
  })
})
`,
)

write(
  'src/server/readiness-registry.spec.ts',
  String.raw`import { describe, expect, it } from 'vitest'

import { ReadinessRegistry } from './readiness-registry.js'

describe('ReadinessRegistry', () => {
  it('keeps the public response coarse while retaining authenticated detail', () => {
    const registry = new ReadinessRegistry()
    registry.setCheck('mission_store', false, 'corrupt record')
    expect(registry.publicSnapshot()).toEqual({ ready: false })
    expect(registry.detailedSnapshot().checks.mission_store?.detail).toBe('corrupt record')
  })
})
`,
)

replace(
  'src/app/api/access-routes.ts',
  "import { APPROVAL_REQUIREMENTS } from '../../access/access-types.js'\n",
  "import { APPROVAL_REQUIREMENTS } from '../../access/access-types.js'\nimport { missingHostedDelegatedLimits } from '../../access/hosted-limit-policy.js'\n",
)
replace(
  'src/app/api/access-routes.ts',
  "  readonly principalKind: RequestPrincipalKind\n}\n",
  "  readonly principalKind: RequestPrincipalKind\n  /** Hosted deployments refuse creation of a delegated grant unless every mandatory execution, session, and cost cap is explicit. */\n  readonly requireExplicitDelegatedLimits?: boolean\n}\n",
)
replace(
  'src/app/api/access-routes.ts',
  "      const approvalPolicy = parseApprovalPolicy(body['approvalPolicy'])\n      const input: CreateGrantInput = {\n",
  "      const approvalPolicy = parseApprovalPolicy(body['approvalPolicy'])\n      if (context.requireExplicitDelegatedLimits === true) {\n        const missing = missingHostedDelegatedLimits(executionLimits, sessionLimits)\n        if (missing.length > 0) {\n          throw new GrantValidationError(\n            `Hosted mode requires explicit delegated-agent limits: ${missing.join(', ')}.`,\n          )\n        }\n      }\n      const input: CreateGrantInput = {\n",
)

replace(
  'src/server/symbolwright-chat-server.ts',
  "import { FixedWindowRateLimiter, type RateLimiter } from './rate-limiter.js'\n",
  "import { FixedWindowRateLimiter, type RateLimiter } from './rate-limiter.js'\nimport { resolveDeploymentSecurity } from './deployment-mode.js'\nimport { MetricsRegistry } from './metrics-registry.js'\nimport { prepareOperationalServerOptions } from './operational-bootstrap.js'\nimport { ReadinessRegistry } from './readiness-registry.js'\nimport {\n  applyOperationalSecurityHeaders,\n  resolveRequestSecurity,\n  sendRequestSecurityRejection,\n} from './trusted-proxy.js'\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "  /** Test seam for the in-memory provider/SSE/autonomous-execution concurrency limiter. */\n  readonly concurrencyGuard?: ProviderConcurrencyGuard\n}\n",
  "  /** Test seam for the in-memory provider/SSE/autonomous-execution concurrency limiter. */\n  readonly concurrencyGuard?: ProviderConcurrencyGuard\n  readonly deploymentMode?: 'local' | 'hosted'\n  readonly trustedProxyCidrs?: readonly string[]\n  readonly allowUnencryptedNonLoopback?: boolean\n  readonly maxProviderConcurrency?: number\n  readonly maxSseStreams?: number\n  readonly maxAutonomousExecutions?: number\n  readonly metricsRegistry?: MetricsRegistry\n  readonly readinessRegistry?: ReadinessRegistry\n}\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "export function assertChatServerCanStart(options: Pick<ChatServerOptions, 'apiKey'>): void {\n  if (options.apiKey.trim().length === 0) {\n    throw new ChatServerConfigError(\n      'SYMBOLWRIGHT_API_KEY is required to start the chat server. Set it before running \"symbolwright serve\" (the legacy CODEMIND_API_KEY name still works).',\n    )\n  }\n}\n",
  "export function assertChatServerCanStart(\n  options: Pick<ChatServerOptions, 'apiKey'> & Partial<ChatServerOptions>,\n): void {\n  if (options.apiKey.trim().length === 0) {\n    throw new ChatServerConfigError(\n      'SYMBOLWRIGHT_API_KEY is required to start the chat server. Set it before running \"symbolwright serve\" (the legacy CODEMIND_API_KEY name still works).',\n    )\n  }\n  try {\n    resolveDeploymentSecurity(options)\n  } catch (error) {\n    throw new ChatServerConfigError(error instanceof Error ? error.message : String(error))\n  }\n}\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "function resolveRequestPrincipal(\n  req: IncomingMessage,\n  apiKey: string,\n  accessRuntime: AccessRuntime,\n): RequestPrincipal | undefined {\n",
  "function resolveRequestPrincipal(\n  req: IncomingMessage,\n  apiKey: string,\n  accessRuntime: AccessRuntime,\n  clientIp: string,\n): RequestPrincipal | undefined {\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "      ip: clientIpFor(req),\n",
  "      ip: clientIp,\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "function clientIpFor(req: IncomingMessage): string {\n  return req.socket.remoteAddress ?? 'unknown'\n}\n\n",
  '',
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "  const env = options.env ?? process.env\n  const localStatusProvider = options.localStatusProvider ?? collectStatus\n  const cwd = options.cwd ?? process.cwd()\n",
  "  const env = options.env ?? process.env\n  const localStatusProvider = options.localStatusProvider ?? collectStatus\n  const cwd = options.cwd ?? process.cwd()\n  const deploymentSecurity = resolveDeploymentSecurity(options)\n  const metricsRegistry = options.metricsRegistry ?? new MetricsRegistry()\n  const readinessRegistry = options.readinessRegistry ?? new ReadinessRegistry()\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "  let lazyGovernanceStore: GovernanceStore | undefined\n  const getGovernanceStore = (): GovernanceStore => {\n    if (lazyGovernanceStore === undefined) {\n      lazyGovernanceStore =\n        options.governanceStore ?? new GovernanceStore(resolveGovernanceStorePath(cwd))\n      // A reservation still `open` past its `expires_at` implies the process crashed mid-call --\n      // settle it conservatively now rather than leaving it to either permanently lock budget or\n      // (if a bare age check were used instead) silently undercount spend.\n      lazyGovernanceStore.settleExpiredReservations()\n      shutdownLifecycle.onBeforeShutdown(() => {\n        lazyGovernanceStore?.close()\n      })\n    }\n    return lazyGovernanceStore\n  }\n  const concurrencyGuard = options.concurrencyGuard ?? new ProviderConcurrencyGuard()\n",
  "  let lazyGovernanceStore: GovernanceStore | undefined = options.governanceStore\n  let governanceCloserRegistered = false\n  const getGovernanceStore = (): GovernanceStore => {\n    lazyGovernanceStore ??= new GovernanceStore(resolveGovernanceStorePath(cwd))\n    // A reservation still `open` past its `expires_at` implies the process crashed mid-call --\n    // settle it conservatively now rather than leaving it to either permanently lock budget or\n    // (if a bare age check were used instead) silently undercount spend.\n    lazyGovernanceStore.settleExpiredReservations()\n    if (!governanceCloserRegistered) {\n      governanceCloserRegistered = true\n      shutdownLifecycle.onBeforeShutdown(() => {\n        lazyGovernanceStore?.close()\n      })\n    }\n    return lazyGovernanceStore\n  }\n  if (lazyGovernanceStore !== undefined) getGovernanceStore()\n  const concurrencyGuard = options.concurrencyGuard ?? new ProviderConcurrencyGuard()\n  if (deploymentSecurity.maxProviderConcurrency !== undefined) {\n    concurrencyGuard.configurePool('provider', deploymentSecurity.maxProviderConcurrency)\n  }\n  if (deploymentSecurity.maxSseStreams !== undefined) {\n    concurrencyGuard.configurePool('sse', deploymentSecurity.maxSseStreams)\n  }\n  if (deploymentSecurity.maxAutonomousExecutions !== undefined) {\n    concurrencyGuard.configurePool('autonomous', deploymentSecurity.maxAutonomousExecutions)\n  }\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "    const url = new URL(req.url ?? '/', 'http://localhost')\n    applyCors(res, options.corsOrigin)\n\n    if (req.method === 'OPTIONS') {\n",
  "    const url = new URL(req.url ?? '/', 'http://localhost')\n    metricsRegistry.trackResponse(req, res)\n    applyOperationalSecurityHeaders(res)\n    const requestSecurity = resolveRequestSecurity(req, deploymentSecurity)\n    if (requestSecurity.rejection !== undefined) {\n      sendRequestSecurityRejection(res, requestSecurity.rejection)\n      return\n    }\n    applyCors(res, options.corsOrigin)\n\n    if (req.method === 'OPTIONS') {\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "    if (req.method === 'GET' && url.pathname === '/api/health') {\n      sendJson(res, 200, { status: 'ok', name: 'SymbolWright Chat API' })\n      return\n    }\n",
  "    if (req.method === 'GET' && url.pathname === '/readyz') {\n      const snapshot = readinessRegistry.publicSnapshot()\n      sendJson(res, snapshot.ready ? 200 : 503, snapshot)\n      return\n    }\n\n    if (req.method === 'GET' && url.pathname === '/api/health') {\n      sendJson(res, 200, { status: 'ok', name: 'SymbolWright Chat API' })\n      return\n    }\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "      if (!deviceFlowRateLimiter.consume(clientIpFor(req))) {\n",
  "      if (!deviceFlowRateLimiter.consume(requestSecurity.clientIp)) {\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "    const principal = resolveRequestPrincipal(req, options.apiKey, accessRuntime)\n",
  "    const principal = resolveRequestPrincipal(\n      req,\n      options.apiKey,\n      accessRuntime,\n      requestSecurity.clientIp,\n    )\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "    const rateLimitKey = principal.grantId ?? clientIpFor(req)\n",
  "    const rateLimitKey = principal.grantId ?? requestSecurity.clientIp\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "    try {\n      if (\n        await handleAccessRoute(req, res, url, {\n          runtime: accessRuntime,\n          actor: principal.actor,\n          principalKind: principal.kind,\n        })\n",
  "    if (req.method === 'GET' && url.pathname === '/api/metrics') {\n      if (principal.kind !== 'operator') {\n        sendJson(res, 404, { error: 'not_found' })\n        return\n      }\n      metricsRegistry.setGauge('provider_requests_active', concurrencyGuard.activeCount('provider'))\n      metricsRegistry.setGauge('sse_streams_active', concurrencyGuard.activeCount('sse'))\n      metricsRegistry.setGauge(\n        'autonomous_executions_active',\n        concurrencyGuard.activeCount('autonomous'),\n      )\n      sendJson(res, 200, metricsRegistry.snapshot())\n      return\n    }\n\n    if (req.method === 'GET' && url.pathname === '/api/diagnostics/readiness') {\n      if (principal.kind !== 'operator') {\n        sendJson(res, 404, { error: 'not_found' })\n        return\n      }\n      sendJson(res, 200, readinessRegistry.detailedSnapshot())\n      return\n    }\n\n    try {\n      if (\n        await handleAccessRoute(req, res, url, {\n          runtime: accessRuntime,\n          actor: principal.actor,\n          principalKind: principal.kind,\n          requireExplicitDelegatedLimits: deploymentSecurity.deploymentMode === 'hosted',\n        })\n",
)
replace(
  'src/server/symbolwright-chat-server.ts',
  "export async function startChatServer(options: ChatServerOptions): Promise<StartedChatServer> {\n  assertChatServerCanStart(options)\n  const warnings = buildChatServerWarnings(options)\n",
  "export async function startChatServer(options: ChatServerOptions): Promise<StartedChatServer> {\n  assertChatServerCanStart(options)\n  const prepared = await prepareOperationalServerOptions(options)\n  options = prepared.options\n  const warnings = prepared.warnings\n",
)

replace(
  'src/app/server/unified-server.ts',
  "import { createAndStartHttpServer, ShutdownLifecycle } from './http-bootstrap.js'\n",
  "import { createAndStartHttpServer, ShutdownLifecycle } from './http-bootstrap.js'\nimport { resolveDeploymentSecurity } from '../../server/deployment-mode.js'\nimport { prepareOperationalServerOptions } from '../../server/operational-bootstrap.js'\nimport {\n  applyOperationalSecurityHeaders,\n  resolveRequestSecurity,\n  sendRequestSecurityRejection,\n} from '../../server/trusted-proxy.js'\n",
)
replace(
  'src/app/server/unified-server.ts',
  "  const chatListener = createChatServerRequestListener(options)\n\n  return (req, res) => {\n",
  "  const chatListener = createChatServerRequestListener(options)\n  const deploymentSecurity = resolveDeploymentSecurity(options)\n\n  return (req, res) => {\n",
)
replace(
  'src/app/server/unified-server.ts',
  "  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {\n    const url = new URL(req.url ?? '/', 'http://localhost')\n\n    if (await tryHandleUnifiedRoute(req, res, url, options.apiKey)) {\n",
  "  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {\n    const url = new URL(req.url ?? '/', 'http://localhost')\n    applyOperationalSecurityHeaders(res)\n    const requestSecurity = resolveRequestSecurity(req, deploymentSecurity)\n    if (requestSecurity.rejection !== undefined) {\n      sendRequestSecurityRejection(res, requestSecurity.rejection)\n      return\n    }\n\n    if (await tryHandleUnifiedRoute(req, res, url, options.apiKey)) {\n",
)
replace(
  'src/app/server/unified-server.ts',
  "  assertChatServerCanStart(options)\n  const warnings = buildChatServerWarnings(options)\n",
  "  assertChatServerCanStart(options)\n  const prepared = await prepareOperationalServerOptions(options)\n  options = prepared.options\n  const warnings = prepared.warnings\n",
)

replace(
  'src/cli-serve.ts',
  "function parsePort(value: string): number {\n",
  "function parseBoolean(value: string | undefined, name: string): boolean | undefined {\n  if (value === undefined) return undefined\n  const normalized = value.trim().toLowerCase()\n  if (normalized === 'true' || normalized === '1') return true\n  if (normalized === 'false' || normalized === '0') return false\n  throw new Error(`${name} must be true/false or 1/0.`)\n}\n\nfunction parsePositiveInteger(value: string | undefined, name: string): number | undefined {\n  if (value === undefined || value.trim().length === 0) return undefined\n  const parsed = Number.parseInt(value, 10)\n  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`)\n  return parsed\n}\n\nfunction parsePort(value: string): number {\n",
)
replace(
  'src/cli-serve.ts',
  "  const tlsKeyFile = readCompatEnv(env, 'SYMBOLWRIGHT_TLS_KEY_FILE', 'CODEMIND_TLS_KEY_FILE')\n\n  return {\n",
  "  const tlsKeyFile = readCompatEnv(env, 'SYMBOLWRIGHT_TLS_KEY_FILE', 'CODEMIND_TLS_KEY_FILE')\n  const deploymentModeValue = env['SYMBOLWRIGHT_DEPLOYMENT_MODE']?.trim()\n  const deploymentMode =\n    deploymentModeValue === undefined || deploymentModeValue.length === 0\n      ? undefined\n      : (deploymentModeValue as 'local' | 'hosted')\n  const trustedProxyCidrs = env['SYMBOLWRIGHT_TRUSTED_PROXY_CIDRS']\n    ?.split(',')\n    .map((value) => value.trim())\n    .filter(Boolean)\n  const allowUnencryptedNonLoopback = parseBoolean(\n    env['SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK'],\n    'SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK',\n  )\n  const maxProviderConcurrency = parsePositiveInteger(\n    env['SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY'],\n    'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY',\n  )\n  const maxSseStreams = parsePositiveInteger(\n    env['SYMBOLWRIGHT_MAX_SSE_STREAMS'],\n    'SYMBOLWRIGHT_MAX_SSE_STREAMS',\n  )\n  const maxAutonomousExecutions = parsePositiveInteger(\n    env['SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS'],\n    'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS',\n  )\n\n  return {\n",
)
replace(
  'src/cli-serve.ts',
  "    ...(tlsKeyFile !== undefined ? { tlsKeyFile } : {}),\n  }\n",
  "    ...(tlsKeyFile !== undefined ? { tlsKeyFile } : {}),\n    ...(deploymentMode !== undefined ? { deploymentMode } : {}),\n    ...(trustedProxyCidrs === undefined ? {} : { trustedProxyCidrs }),\n    ...(allowUnencryptedNonLoopback === undefined\n      ? {}\n      : { allowUnencryptedNonLoopback }),\n    ...(maxProviderConcurrency === undefined ? {} : { maxProviderConcurrency }),\n    ...(maxSseStreams === undefined ? {} : { maxSseStreams }),\n    ...(maxAutonomousExecutions === undefined ? {} : { maxAutonomousExecutions }),\n  }\n",
)
replace(
  'src/cli-serve.ts',
  "    '- GET  /api/health                public health check',\n",
  "    '- GET  /api/health                public liveness check',\n    '- GET  /readyz                    public coarse readiness check',\n    '- GET  /api/metrics               operator-only process metrics',\n",
)

replace(
  'CHANGELOG.md',
  '### Fixed\n',
  `### Fixed\n\n- **Network and operational hardening (Bundle #12 PR 5)**: adds explicit local/hosted deployment modes; fail-closed non-loopback plaintext behavior; direct-TLS or trusted-reverse-proxy HTTPS enforcement; right-to-left trusted X-Forwarded-For resolution with IPv4-mapped IPv6 normalization; strict rightmost forwarded-protocol validation and conflict rejection; coarse public /readyz plus operator-only readiness detail and metrics; startup boot sweeping for stale missions, sandbox corruption, and external-repository retention; hosted-mode startup refusal when the governance ledger, process concurrency caps, or delegated-agent execution/session/cost limits are missing.\n\n`,
)

fs.rmSync(path.join(root, 'scripts/.bundle12-pr5-apply.mjs'), { force: true })
fs.rmSync(path.join(root, '.github/workflows/bundle12-pr5-builder.yml'), { force: true })
