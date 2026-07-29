import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import {
  SANDBOX_EGRESS_CAPABILITY,
  canonicalSandboxCapabilityId,
} from '../access/sandbox-capabilities.js'
import type {
  SandboxApprovalBinding,
  SandboxAuthorizationContext,
  SandboxCallerKind,
  SandboxDeploymentMode,
  SandboxPolicyReference,
  SandboxPolicySourceEvidence,
} from './sandbox-policy-model.js'

export const EGRESS_POLICY_SCHEMA_VERSION = 1 as const
export const EGRESS_GLOBAL_POLICY_ID = 'egress-global' as const

export const EGRESS_HTTP_METHODS = ['GET', 'HEAD', 'POST'] as const
export type EgressHttpMethod = (typeof EGRESS_HTTP_METHODS)[number]

export const EGRESS_REDIRECT_POLICIES = ['denied', 'same-host', 'allowlisted'] as const
export type EgressRedirectPolicy = (typeof EGRESS_REDIRECT_POLICIES)[number]

export const EGRESS_CREDENTIAL_POLICIES = ['none'] as const
export type EgressCredentialPolicy = (typeof EGRESS_CREDENTIAL_POLICIES)[number]

export const EGRESS_RUNTIME_STATES = [
  'disabled',
  'dependency-only',
  'allowlisted',
  'unsupported',
  'denied',
  'quota-exhausted',
] as const
export type EgressRuntimeState = (typeof EGRESS_RUNTIME_STATES)[number]

export interface EgressPolicyLimits {
  readonly maxRequests: number
  readonly maxRequestBytes: number
  readonly maxResponseBytes: number
  readonly maxTotalSentBytes: number
  readonly maxTotalReceivedBytes: number
  readonly timeoutMs: number
  readonly maxConcurrency: number
  readonly maxRedirects: number
}

export const DEFAULT_EGRESS_POLICY_LIMITS: EgressPolicyLimits = {
  maxRequests: 32,
  maxRequestBytes: 1024 * 1024,
  maxResponseBytes: 8 * 1024 * 1024,
  maxTotalSentBytes: 4 * 1024 * 1024,
  maxTotalReceivedBytes: 32 * 1024 * 1024,
  timeoutMs: 60_000,
  maxConcurrency: 2,
  maxRedirects: 3,
}

export interface EgressPolicyProfile {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly emergencyDisabled?: boolean
  readonly deploymentModes: readonly SandboxDeploymentMode[]
  readonly callerKinds: readonly SandboxCallerKind[]
  readonly allowedHosts: readonly string[]
  readonly allowedMethods: readonly EgressHttpMethod[]
  readonly allowedRequestHeaders: readonly string[]
  readonly allowedPorts: readonly number[]
  readonly redirectPolicy: EgressRedirectPolicy
  readonly credentialPolicy: EgressCredentialPolicy
  readonly requireTls: true
  readonly auditRetentionDays: number
  readonly limits: EgressPolicyLimits
}

export interface EgressPolicyRequest {
  readonly limits?: Partial<EgressPolicyLimits>
}

export interface EffectiveEgressPolicy {
  readonly schemaVersion: typeof EGRESS_POLICY_SCHEMA_VERSION
  readonly policyId: string
  readonly policyVersion: number
  readonly fingerprint: string
  readonly resolvedAt: string
  readonly deploymentMode: SandboxDeploymentMode
  readonly callerKind: SandboxCallerKind
  readonly capabilityId: typeof SANDBOX_EGRESS_CAPABILITY
  readonly allowedHosts: readonly string[]
  readonly allowedMethods: readonly EgressHttpMethod[]
  readonly allowedRequestHeaders: readonly string[]
  readonly allowedPorts: readonly number[]
  readonly redirectPolicy: EgressRedirectPolicy
  readonly credentialPolicy: EgressCredentialPolicy
  readonly requireTls: true
  readonly auditRetentionDays: number
  readonly limits: EgressPolicyLimits
  readonly sources: readonly SandboxPolicySourceEvidence[]
}

export interface EgressPolicyDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly state: EgressRuntimeState
  readonly policy?: EffectiveEgressPolicy
}

export interface ResolveEgressPolicyInput {
  readonly request: EgressPolicyRequest
  readonly authorization: SandboxAuthorizationContext
  readonly catalog: EgressPolicyCatalog
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
}

export interface EgressRequestDescriptor {
  readonly url: string
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly bodyBytes?: number
}

export interface AuthorizedEgressRequest {
  readonly url: URL
  readonly method: EgressHttpMethod
  readonly headers: Readonly<Record<string, string>>
  readonly bodyBytes: number
}

const FORBIDDEN_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'connection',
  'content-length',
  'forwarded',
  'host',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
])

export class EgressPolicyCatalog {
  private readonly profiles: ReadonlyMap<string, readonly EgressPolicyProfile[]>

  public constructor(profiles: readonly EgressPolicyProfile[] = []) {
    const grouped = new Map<string, EgressPolicyProfile[]>()
    for (const profile of profiles) {
      validateEgressProfile(profile)
      const existing = grouped.get(profile.id) ?? []
      existing.push(deepFreeze(cloneProfile(profile)))
      grouped.set(profile.id, existing)
    }
    this.profiles = new Map(
      [...grouped.entries()].map(([id, versions]) => [
        id,
        [...versions].sort((left, right) => right.version - left.version),
      ]),
    )
  }

  public latest(id: string): EgressPolicyProfile | undefined {
    return this.profiles.get(id)?.[0]
  }

  public resolve(reference: SandboxPolicyReference): EgressPolicyProfile | undefined {
    return this.profiles.get(reference.id)?.find((profile) => profile.version === reference.version)
  }

  public listLatest(): readonly EgressPolicyProfile[] {
    return Object.freeze(
      [...this.profiles.values()]
        .map((versions) => versions[0])
        .filter((profile): profile is EgressPolicyProfile => profile !== undefined)
        .sort((left, right) => left.id.localeCompare(right.id)),
    )
  }
}

export function resolveEffectiveEgressPolicy(
  input: ResolveEgressPolicyInput,
): EgressPolicyDecision {
  const env = input.env ?? process.env
  if (env['SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS'] === 'true') {
    return blocked(
      'EGRESS_GLOBALLY_DISABLED',
      'Brokered sandbox egress is disabled by the emergency kill switch.',
      'disabled',
    )
  }

  const approvedCapabilities = input.authorization.approvedCapabilityIds.map(
    canonicalSandboxCapabilityId,
  )
  if (!approvedCapabilities.includes(SANDBOX_EGRESS_CAPABILITY)) {
    return blocked(
      'EGRESS_CAPABILITY_NOT_APPROVED',
      `The server authorization context does not approve ${SANDBOX_EGRESS_CAPABILITY}.`,
      'denied',
    )
  }
  if (input.authorization.runtimeMode !== 'APPROVED_EXECUTION') {
    return blocked(
      'EGRESS_RUNTIME_MODE_BLOCKED',
      `${input.authorization.runtimeMode} cannot use brokered egress.`,
      'denied',
    )
  }

  const reference = input.authorization.policyReference
  if (reference === undefined) {
    return blocked(
      'EGRESS_POLICY_REFERENCE_REQUIRED',
      'Brokered egress requires an explicit operator-owned policy reference.',
      'disabled',
    )
  }
  const latest = input.catalog.latest(reference.id)
  if (latest === undefined) {
    return blocked(
      'EGRESS_POLICY_NOT_FOUND',
      `Egress policy ${reference.id}@${reference.version} is not installed.`,
      'unsupported',
    )
  }
  if (latest.version !== reference.version) {
    return blocked(
      'EGRESS_POLICY_VERSION_STALE',
      `Egress policy ${reference.id}@${reference.version} is stale; current version is ${latest.version}.`,
      'denied',
    )
  }

  const profile = input.catalog.resolve(reference)
  if (profile === undefined || !profile.enabled) {
    return blocked('EGRESS_POLICY_DISABLED', 'The selected egress policy is disabled.', 'disabled')
  }
  if (profile.emergencyDisabled === true) {
    return blocked(
      'EGRESS_PROFILE_EMERGENCY_DISABLED',
      'The selected egress policy is emergency-disabled.',
      'disabled',
    )
  }
  if (!profile.deploymentModes.includes(input.authorization.deploymentMode)) {
    return blocked(
      'EGRESS_DEPLOYMENT_NOT_ALLOWED',
      `Egress policy ${profile.id}@${profile.version} does not allow ${input.authorization.deploymentMode} deployment.`,
      'denied',
    )
  }
  if (!profile.callerKinds.includes(input.authorization.callerKind)) {
    return blocked(
      'EGRESS_CALLER_NOT_ALLOWED',
      `Egress policy ${profile.id}@${profile.version} does not allow ${input.authorization.callerKind} callers.`,
      'denied',
    )
  }

  const globalVersion = positiveInteger(env['SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION'], 1)
  const sources = egressPolicySources(input.authorization, profile, globalVersion)
  const approvalFailure = validateApproval(
    input.authorization.approval,
    input.authorization.grantVersion,
    sources,
  )
  if (approvalFailure !== undefined) return approvalFailure

  const limits = intersectEgressLimits(profile.limits, input.request.limits)
  const material = {
    schemaVersion: EGRESS_POLICY_SCHEMA_VERSION,
    policyId: profile.id,
    policyVersion: profile.version,
    deploymentMode: input.authorization.deploymentMode,
    callerKind: input.authorization.callerKind,
    capabilityId: SANDBOX_EGRESS_CAPABILITY,
    allowedHosts: normalizeAllowedHosts(profile.allowedHosts),
    allowedMethods: uniqueSorted(profile.allowedMethods),
    allowedRequestHeaders: uniqueSorted(
      profile.allowedRequestHeaders.map((header) => header.toLowerCase()),
    ),
    allowedPorts: uniqueSortedNumbers(profile.allowedPorts),
    redirectPolicy: profile.redirectPolicy,
    credentialPolicy: profile.credentialPolicy,
    requireTls: true as const,
    auditRetentionDays: profile.auditRetentionDays,
    limits,
    sources,
  }
  const policy: EffectiveEgressPolicy = deepFreeze({
    ...material,
    fingerprint: sha256(stableJson(material)),
    resolvedAt: (input.now ?? (() => new Date()))().toISOString(),
  })

  return {
    allowed: true,
    reasonCode: 'EGRESS_POLICY_ALLOWED',
    reason: `Resolved ${profile.id}@${profile.version} for brokered allowlisted egress.`,
    state: 'allowlisted',
    policy,
  }
}

export function authorizeEgressRequest(
  policy: EffectiveEgressPolicy,
  request: EgressRequestDescriptor,
): AuthorizedEgressRequest {
  const url = normalizeEgressUrl(request.url)
  if (!isHostAllowedByEgressPolicy(url.hostname, policy.allowedHosts)) {
    throw new EgressPolicyError(
      'EGRESS_DESTINATION_NOT_ALLOWED',
      `Destination host is outside the operator-owned egress allowlist: ${url.hostname}`,
    )
  }
  const port = url.port.length === 0 ? 443 : Number(url.port)
  if (!policy.allowedPorts.includes(port)) {
    throw new EgressPolicyError(
      'EGRESS_PORT_NOT_ALLOWED',
      `Destination port ${port} is outside the operator-owned egress allowlist.`,
    )
  }

  const method = normalizeMethod(request.method)
  if (!policy.allowedMethods.includes(method)) {
    throw new EgressPolicyError(
      'EGRESS_METHOD_NOT_ALLOWED',
      `HTTP method ${method} is outside the operator-owned egress allowlist.`,
    )
  }

  const headers = normalizeRequestHeaders(request.headers ?? {}, policy)
  const bodyBytes = request.bodyBytes ?? 0
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 0) {
    throw new EgressPolicyError(
      'EGRESS_REQUEST_BODY_INVALID',
      'Egress request body size must be a non-negative safe integer.',
    )
  }
  if (bodyBytes > policy.limits.maxRequestBytes) {
    throw new EgressPolicyError(
      'EGRESS_REQUEST_QUOTA_EXCEEDED',
      `Egress request body exceeds ${policy.limits.maxRequestBytes} bytes.`,
    )
  }

  return Object.freeze({ url, method, headers, bodyBytes })
}

export class EgressPolicyError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'EgressPolicyError'
    this.code = code
  }
}

export function normalizeEgressUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new EgressPolicyError('EGRESS_URL_INVALID', 'Egress destination URL is invalid.')
  }
  if (parsed.protocol !== 'https:') {
    throw new EgressPolicyError('EGRESS_SCHEME_NOT_ALLOWED', 'Brokered egress requires HTTPS.')
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new EgressPolicyError(
      'EGRESS_CREDENTIALS_FORBIDDEN',
      'Egress destination URLs must not contain credentials.',
    )
  }
  if (isIP(parsed.hostname) !== 0) {
    throw new EgressPolicyError(
      'EGRESS_DIRECT_IP_FORBIDDEN',
      'Direct IP egress destinations are forbidden.',
    )
  }
  if (parsed.port.length > 0 && parsed.port !== '443') {
    throw new EgressPolicyError(
      'EGRESS_PORT_NOT_ALLOWED',
      'Brokered egress permits HTTPS port 443 only.',
    )
  }
  parsed.hash = ''
  return parsed
}

export function isHostAllowedByEgressPolicy(
  hostname: string,
  allowedHosts: readonly string[],
): boolean {
  const candidate = normalizeHostname(hostname)
  return allowedHosts.some((allowed) => {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(2)
      return candidate.length > suffix.length && candidate.endsWith(`.${suffix}`)
    }
    return candidate === allowed
  })
}

export function describeEgressRuntimeState(input: {
  readonly globallyDisabled: boolean
  readonly profileCount: number
  readonly brokerSupported: boolean
  readonly denied?: boolean
  readonly quotaExhausted?: boolean
}): EgressRuntimeState {
  if (input.globallyDisabled) return 'disabled'
  if (!input.brokerSupported) return 'unsupported'
  if (input.quotaExhausted === true) return 'quota-exhausted'
  if (input.denied === true) return 'denied'
  return input.profileCount > 0 ? 'allowlisted' : 'dependency-only'
}

function normalizeRequestHeaders(
  headers: Readonly<Record<string, string>>,
  policy: EffectiveEgressPolicy,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.trim().toLowerCase()
    if (name.length === 0 || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new EgressPolicyError('EGRESS_HEADER_INVALID', 'Egress request header name is invalid.')
    }
    if (FORBIDDEN_REQUEST_HEADERS.has(name)) {
      throw new EgressPolicyError(
        'EGRESS_HEADER_FORBIDDEN',
        `Egress request header ${name} is forbidden.`,
      )
    }
    if (!policy.allowedRequestHeaders.includes(name)) {
      throw new EgressPolicyError(
        'EGRESS_HEADER_NOT_ALLOWED',
        `Egress request header ${name} is outside the operator-owned allowlist.`,
      )
    }
    if (value.includes('\r') || value.includes('\n') || Buffer.byteLength(value, 'utf8') > 8192) {
      throw new EgressPolicyError(
        'EGRESS_HEADER_INVALID',
        `Egress request header ${name} has an invalid value.`,
      )
    }
    result[name] = value
  }
  return Object.freeze(result)
}

function normalizeMethod(value: string | undefined): EgressHttpMethod {
  const method = (value ?? 'GET').toUpperCase()
  if (!EGRESS_HTTP_METHODS.includes(method as EgressHttpMethod)) {
    throw new EgressPolicyError(
      'EGRESS_METHOD_UNSUPPORTED',
      `Unsupported brokered egress method: ${method}`,
    )
  }
  return method as EgressHttpMethod
}

function egressPolicySources(
  authorization: SandboxAuthorizationContext,
  profile: EgressPolicyProfile,
  globalVersion: number,
): readonly SandboxPolicySourceEvidence[] {
  const sources: SandboxPolicySourceEvidence[] = [
    { id: EGRESS_GLOBAL_POLICY_ID, version: globalVersion, kind: 'global' },
    { id: profile.id, version: profile.version, kind: 'operator-profile' },
  ]
  if (authorization.grantId !== undefined) {
    sources.push({
      id: `grant:${authorization.grantId}`,
      version: authorization.grantVersion ?? 1,
      kind: 'grant',
    })
  }
  if (authorization.missionId !== undefined) {
    sources.push({ id: `mission:${authorization.missionId}`, version: 1, kind: 'mission' })
  }
  sources.push({ id: 'egress-request-tightening', version: 1, kind: 'request' })
  return Object.freeze(sources)
}

function validateApproval(
  approval: SandboxApprovalBinding | undefined,
  grantVersion: number | undefined,
  sources: readonly SandboxPolicySourceEvidence[],
): EgressPolicyDecision | undefined {
  if (approval === undefined) {
    return blocked(
      'EGRESS_APPROVAL_REQUIRED',
      'Brokered egress requires a current operator approval bound to policy versions.',
      'denied',
    )
  }
  if (canonicalSandboxCapabilityId(approval.capabilityId) !== SANDBOX_EGRESS_CAPABILITY) {
    return blocked(
      'EGRESS_APPROVAL_CAPABILITY_MISMATCH',
      'The supplied approval is bound to a different capability.',
      'denied',
    )
  }
  if (grantVersion !== undefined && approval.grantVersion !== grantVersion) {
    return blocked(
      'EGRESS_APPROVAL_GRANT_STALE',
      'The supplied approval was issued for a different grant version.',
      'denied',
    )
  }
  for (const source of sources) {
    const approvedVersion = approval.policyVersions[source.id]
    if (approvedVersion === undefined) {
      return blocked(
        'EGRESS_APPROVAL_POLICY_INCOMPLETE',
        `Approval is not bound to egress policy source ${source.id}.`,
        'denied',
      )
    }
    if (approvedVersion !== source.version) {
      return blocked(
        'EGRESS_APPROVAL_POLICY_STALE',
        `Approval policy binding ${source.id}@${approvedVersion} does not match resolved version ${source.version}.`,
        'denied',
      )
    }
  }
  return undefined
}

function intersectEgressLimits(
  profile: EgressPolicyLimits,
  requested: Partial<EgressPolicyLimits> | undefined,
): EgressPolicyLimits {
  const limit = (key: keyof EgressPolicyLimits): number => {
    const value = requested?.[key]
    if (value === undefined || !Number.isFinite(value) || value <= 0) return profile[key]
    return Math.max(1, Math.floor(Math.min(profile[key], value)))
  }
  return {
    maxRequests: limit('maxRequests'),
    maxRequestBytes: limit('maxRequestBytes'),
    maxResponseBytes: limit('maxResponseBytes'),
    maxTotalSentBytes: limit('maxTotalSentBytes'),
    maxTotalReceivedBytes: limit('maxTotalReceivedBytes'),
    timeoutMs: limit('timeoutMs'),
    maxConcurrency: limit('maxConcurrency'),
    maxRedirects: limit('maxRedirects'),
  }
}

function validateEgressProfile(profile: EgressPolicyProfile): void {
  if (profile.id.trim().length === 0) throw new Error('Egress policy id must not be empty.')
  if (!Number.isSafeInteger(profile.version) || profile.version <= 0) {
    throw new Error('Egress policy version must be a positive integer.')
  }
  if (profile.allowedHosts.length === 0) {
    throw new Error('Egress policy must contain at least one allowed host.')
  }
  normalizeAllowedHosts(profile.allowedHosts)
  if (profile.allowedMethods.length === 0) {
    throw new Error('Egress policy must contain at least one allowed HTTP method.')
  }
  for (const method of profile.allowedMethods) {
    if (!EGRESS_HTTP_METHODS.includes(method)) {
      throw new Error(`Unsupported egress HTTP method: ${method}`)
    }
  }
  for (const header of profile.allowedRequestHeaders) {
    const normalized = header.trim().toLowerCase()
    if (normalized.length === 0 || FORBIDDEN_REQUEST_HEADERS.has(normalized)) {
      throw new Error(`Forbidden egress request header in profile: ${header}`)
    }
  }
  if (profile.allowedPorts.length === 0 || profile.allowedPorts.some((port) => port !== 443)) {
    throw new Error('The first brokered egress release supports HTTPS port 443 only.')
  }
  if (!Number.isSafeInteger(profile.auditRetentionDays) || profile.auditRetentionDays <= 0) {
    throw new Error('Egress audit retention must be a positive integer number of days.')
  }
  for (const [name, value] of Object.entries(profile.limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Egress policy limit ${name} must be a positive safe integer.`)
    }
  }
}

function normalizeAllowedHosts(values: readonly string[]): readonly string[] {
  return Object.freeze(
    uniqueSorted(
      values.map((value) => {
        const trimmed = value.trim().toLowerCase()
        const wildcard = trimmed.startsWith('*.')
        const hostname = wildcard ? trimmed.slice(2) : trimmed
        const normalized = normalizeHostname(hostname)
        if (wildcard && normalized.split('.').length < 2) {
          throw new Error(`Egress wildcard host is too broad: ${value}`)
        }
        return wildcard ? `*.${normalized}` : normalized
      }),
    ),
  )
}

function normalizeHostname(value: string): string {
  if (value.length === 0 || value.includes('/') || value.includes(':')) {
    throw new Error(`Invalid egress hostname: ${value}`)
  }
  const parsed = new URL(`https://${value}/`)
  if (isIP(parsed.hostname) !== 0 || parsed.hostname.length === 0) {
    throw new Error(`Direct IP or empty egress hostname is forbidden: ${value}`)
  }
  return parsed.hostname.toLowerCase().replace(/\.$/, '')
}

function cloneProfile(profile: EgressPolicyProfile): EgressPolicyProfile {
  return {
    ...profile,
    deploymentModes: [...profile.deploymentModes],
    callerKinds: [...profile.callerKinds],
    allowedHosts: [...profile.allowedHosts],
    allowedMethods: [...profile.allowedMethods],
    allowedRequestHeaders: [...profile.allowedRequestHeaders],
    allowedPorts: [...profile.allowedPorts],
    limits: { ...profile.limits },
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function blocked(
  reasonCode: string,
  reason: string,
  state: EgressRuntimeState,
): EgressPolicyDecision {
  return { allowed: false, reasonCode, reason, state }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
