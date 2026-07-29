import { createHash } from 'node:crypto'

import { SANDBOX_EGRESS_CAPABILITY } from '../access/sandbox-capabilities.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

export const EGRESS_GLOBAL_POLICY_ID = 'sandbox-egress-global' as const

export type EgressState =
  'disabled' | 'dependency-only' | 'allowlisted' | 'unsupported' | 'denied' | 'quota-exhausted'

export interface EgressPolicyLimits {
  readonly maxRequests: number
  readonly maxRequestBytes: number
  readonly maxResponseBytes: number
  readonly maxTotalBytes: number
  readonly timeoutMs: number
  readonly maxConcurrency: number
  readonly maxRedirects: number
}

export const DEFAULT_EGRESS_POLICY_LIMITS: EgressPolicyLimits = Object.freeze({
  maxRequests: 32,
  maxRequestBytes: 1024 * 1024,
  maxResponseBytes: 8 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  timeoutMs: 60_000,
  maxConcurrency: 4,
  maxRedirects: 3,
})

export interface EgressDestinationRule {
  readonly hostname: string
  readonly pathPrefixes: readonly string[]
  readonly ports: readonly number[]
  readonly methods: readonly string[]
}

export interface EgressPolicyProfile {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly deploymentModes: readonly string[]
  readonly callerKinds: readonly string[]
  readonly destinations: readonly EgressDestinationRule[]
  readonly limits: EgressPolicyLimits
}

export interface EffectiveEgressPolicy {
  readonly id: string
  readonly version: number
  readonly state: EgressState
  readonly destinations: readonly EgressDestinationRule[]
  readonly limits: EgressPolicyLimits
  readonly fingerprintSha256: string
}

export class EgressPolicyError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'EgressPolicyError'
    this.code = code
  }
}

export class EgressPolicyCatalog {
  private readonly profiles = new Map<string, EgressPolicyProfile>()
  private globalVersion = 1
  private globallyEnabled = false

  public constructor(profiles: readonly EgressPolicyProfile[] = []) {
    for (const profile of profiles) this.upsert(profile)
  }

  public upsert(profile: EgressPolicyProfile): void {
    assertProfile(profile)
    this.profiles.set(profile.id, freezeProfile(profile))
  }

  public setGlobalState(input: { readonly enabled: boolean; readonly version: number }): void {
    if (!Number.isSafeInteger(input.version) || input.version < this.globalVersion) {
      throw new EgressPolicyError(
        'EGRESS_GLOBAL_POLICY_VERSION_INVALID',
        'Egress global policy version must be a monotonic positive integer.',
      )
    }
    this.globallyEnabled = input.enabled
    this.globalVersion = input.version
  }

  public resolve(input: {
    readonly authorization: SandboxAuthorizationContext
    readonly profileId: string
    readonly requestLimits?: Partial<EgressPolicyLimits>
  }): EffectiveEgressPolicy {
    const profile = this.profiles.get(input.profileId)
    if (profile === undefined) {
      throw new EgressPolicyError(
        'EGRESS_PROFILE_NOT_FOUND',
        'Egress policy profile was not found.',
      )
    }
    if (!this.globallyEnabled || !profile.enabled) {
      throw new EgressPolicyError(
        'EGRESS_DISABLED',
        'Brokered egress is disabled by operator policy.',
      )
    }
    const authorization = input.authorization
    if (authorization.runtimeMode !== 'APPROVED_EXECUTION') {
      throw new EgressPolicyError(
        'EGRESS_RUNTIME_MODE_DENIED',
        'Brokered egress requires APPROVED_EXECUTION.',
      )
    }
    if (!authorization.approvedCapabilityIds.includes(SANDBOX_EGRESS_CAPABILITY)) {
      throw new EgressPolicyError(
        'EGRESS_CAPABILITY_REQUIRED',
        'Brokered egress requires the explicit sandbox egress capability.',
      )
    }
    if (!profile.deploymentModes.includes(authorization.deploymentMode)) {
      throw new EgressPolicyError(
        'EGRESS_DEPLOYMENT_MODE_DENIED',
        'Egress policy does not permit this deployment mode.',
      )
    }
    if (!profile.callerKinds.includes(authorization.callerKind)) {
      throw new EgressPolicyError(
        'EGRESS_CALLER_KIND_DENIED',
        'Egress policy does not permit this caller kind.',
      )
    }
    if (authorization.approval === undefined) {
      throw new EgressPolicyError('EGRESS_APPROVAL_REQUIRED', 'Brokered egress requires approval.')
    }
    if (authorization.approval.capabilityId !== SANDBOX_EGRESS_CAPABILITY) {
      throw new EgressPolicyError(
        'EGRESS_APPROVAL_CAPABILITY_MISMATCH',
        'Approval is not bound to the egress capability.',
      )
    }
    if (authorization.grantVersion !== undefined) {
      if (authorization.approval.grantVersion !== authorization.grantVersion) {
        throw new EgressPolicyError(
          'EGRESS_APPROVAL_GRANT_STALE',
          'Egress approval is stale for the current grant version.',
        )
      }
      const approvedGrantVersion =
        authorization.approval.policyVersions[`grant:${authorization.grantId ?? ''}`]
      if (approvedGrantVersion !== authorization.grantVersion) {
        throw new EgressPolicyError(
          'EGRESS_APPROVAL_GRANT_POLICY_STALE',
          'Egress approval is not bound to the current grant policy version.',
        )
      }
    }
    if (authorization.approval.policyVersions[EGRESS_GLOBAL_POLICY_ID] !== this.globalVersion) {
      throw new EgressPolicyError(
        'EGRESS_GLOBAL_POLICY_STALE',
        'Egress approval is stale for the current global policy revision.',
      )
    }
    if (authorization.approval.policyVersions[profile.id] !== profile.version) {
      throw new EgressPolicyError(
        'EGRESS_PROFILE_POLICY_STALE',
        'Egress approval is stale for the current profile revision.',
      )
    }

    const limits = narrowLimits(profile.limits, input.requestLimits)
    const serializable = {
      id: profile.id,
      version: profile.version,
      state: 'allowlisted' as const,
      destinations: profile.destinations,
      limits,
    }
    return Object.freeze({
      ...serializable,
      fingerprintSha256: sha256(stableJson(serializable)),
    })
  }
}

export function isEgressUrlAllowed(
  url: URL,
  method: string,
  policy: EffectiveEgressPolicy,
): boolean {
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0) return false
  const port = url.port.length === 0 ? 443 : Number(url.port)
  const normalizedMethod = method.toUpperCase()
  return policy.destinations.some((rule) => {
    if (url.hostname.toLowerCase() !== rule.hostname.toLowerCase()) return false
    if (!rule.ports.includes(port)) return false
    if (!rule.methods.includes(normalizedMethod)) return false
    return rule.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix))
  })
}

function narrowLimits(
  base: EgressPolicyLimits,
  requested: Partial<EgressPolicyLimits> | undefined,
): EgressPolicyLimits {
  const pick = (key: keyof EgressPolicyLimits): number => {
    const value = requested?.[key]
    if (value === undefined) return base[key]
    if (!Number.isSafeInteger(value) || value <= 0 || value > base[key]) {
      throw new EgressPolicyError(
        'EGRESS_LIMIT_WIDENING_DENIED',
        `Requested egress limit ${key} must be a positive narrowing of operator policy.`,
      )
    }
    return value
  }
  return Object.freeze({
    maxRequests: pick('maxRequests'),
    maxRequestBytes: pick('maxRequestBytes'),
    maxResponseBytes: pick('maxResponseBytes'),
    maxTotalBytes: pick('maxTotalBytes'),
    timeoutMs: pick('timeoutMs'),
    maxConcurrency: pick('maxConcurrency'),
    maxRedirects: pick('maxRedirects'),
  })
}

function assertProfile(profile: EgressPolicyProfile): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/.test(profile.id)) {
    throw new EgressPolicyError('EGRESS_PROFILE_ID_INVALID', 'Egress profile ID is invalid.')
  }
  if (!Number.isSafeInteger(profile.version) || profile.version <= 0) {
    throw new EgressPolicyError(
      'EGRESS_PROFILE_VERSION_INVALID',
      'Egress profile version is invalid.',
    )
  }
  if (profile.destinations.length === 0) {
    throw new EgressPolicyError(
      'EGRESS_DESTINATIONS_REQUIRED',
      'Egress profiles must contain at least one destination.',
    )
  }
  for (const destination of profile.destinations) {
    if (destination.hostname.length === 0 || destination.hostname.includes('*')) {
      throw new EgressPolicyError(
        'EGRESS_DESTINATION_HOST_INVALID',
        'Egress destination hosts must be exact names without wildcards.',
      )
    }
    if (destination.pathPrefixes.length === 0 || destination.ports.length === 0) {
      throw new EgressPolicyError(
        'EGRESS_DESTINATION_SCOPE_INVALID',
        'Egress destinations require path and port restrictions.',
      )
    }
    if (destination.ports.some((port) => port !== 443)) {
      throw new EgressPolicyError(
        'EGRESS_DESTINATION_PORT_INVALID',
        'Initial brokered egress profiles permit HTTPS port 443 only.',
      )
    }
  }
  narrowLimits(profile.limits, undefined)
}

function freezeProfile(profile: EgressPolicyProfile): EgressPolicyProfile {
  return Object.freeze({
    ...profile,
    deploymentModes: Object.freeze([...profile.deploymentModes]),
    callerKinds: Object.freeze([...profile.callerKinds]),
    destinations: Object.freeze(
      profile.destinations.map((destination) =>
        Object.freeze({
          hostname: destination.hostname.toLowerCase(),
          pathPrefixes: Object.freeze([...destination.pathPrefixes]),
          ports: Object.freeze([...destination.ports]),
          methods: Object.freeze(destination.methods.map((method) => method.toUpperCase())),
        }),
      ),
    ),
    limits: Object.freeze({ ...profile.limits }),
  })
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
