import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
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

export const DEPENDENCY_POLICY_SCHEMA_VERSION = 1 as const
export const DEPENDENCY_GLOBAL_POLICY_ID = 'dependency-global' as const
export const DEPENDENCY_ECOSYSTEMS = ['npm'] as const
export type DependencyEcosystem = (typeof DEPENDENCY_ECOSYSTEMS)[number]

export interface DependencyAcquisitionLimits {
  readonly maxPackages: number
  readonly maxRequests: number
  readonly maxArchiveBytes: number
  readonly maxExpandedBytes: number
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
  readonly timeoutMs: number
  readonly maxConcurrency: number
}

export const DEFAULT_DEPENDENCY_ACQUISITION_LIMITS: DependencyAcquisitionLimits = {
  maxPackages: 2_000,
  maxRequests: 2_500,
  maxArchiveBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxFiles: 100_000,
  maxFileBytes: 32 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  timeoutMs: 300_000,
  maxConcurrency: 4,
}

export interface DependencyPolicyProfile {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly ecosystems: readonly DependencyEcosystem[]
  readonly deploymentModes: readonly SandboxDeploymentMode[]
  readonly callerKinds: readonly SandboxCallerKind[]
  readonly allowedRegistries: readonly string[]
  readonly requireLockfile: true
  readonly allowLockfileMutation: false
  readonly suppressLifecycleScripts: true
  readonly directIpDestinations: 'denied'
  readonly cacheNamespace: string
  readonly limits: DependencyAcquisitionLimits
}

export interface DependencyPolicyRequest {
  readonly ecosystem: DependencyEcosystem
  readonly registryUrls?: readonly string[]
  readonly limits?: Partial<DependencyAcquisitionLimits>
}

export interface EffectiveDependencyPolicy {
  readonly schemaVersion: typeof DEPENDENCY_POLICY_SCHEMA_VERSION
  readonly policyId: string
  readonly policyVersion: number
  readonly fingerprint: string
  readonly resolvedAt: string
  readonly ecosystem: DependencyEcosystem
  readonly deploymentMode: SandboxDeploymentMode
  readonly callerKind: SandboxCallerKind
  readonly capabilityId: typeof SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY
  readonly allowedRegistries: readonly string[]
  readonly requireLockfile: true
  readonly allowLockfileMutation: false
  readonly suppressLifecycleScripts: true
  readonly directIpDestinations: 'denied'
  readonly cacheNamespace: string
  readonly limits: DependencyAcquisitionLimits
  readonly sources: readonly SandboxPolicySourceEvidence[]
}

export interface DependencyPolicyDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly policy?: EffectiveDependencyPolicy
}

export interface ResolveDependencyPolicyInput {
  readonly request: DependencyPolicyRequest
  readonly authorization: SandboxAuthorizationContext
  readonly catalog: DependencyPolicyCatalog
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
}

export class DependencyPolicyCatalog {
  private readonly profiles: ReadonlyMap<string, readonly DependencyPolicyProfile[]>

  public constructor(profiles: readonly DependencyPolicyProfile[] = []) {
    const grouped = new Map<string, DependencyPolicyProfile[]>()
    for (const profile of profiles) {
      validateProfile(profile)
      const existing = grouped.get(profile.id) ?? []
      existing.push(deepFreeze({ ...profile }))
      grouped.set(profile.id, existing)
    }
    this.profiles = new Map(
      [...grouped.entries()].map(([id, versions]) => [
        id,
        [...versions].sort((left, right) => right.version - left.version),
      ]),
    )
  }

  public latest(id: string): DependencyPolicyProfile | undefined {
    return this.profiles.get(id)?.[0]
  }

  public resolve(reference: SandboxPolicyReference): DependencyPolicyProfile | undefined {
    return this.profiles.get(reference.id)?.find((profile) => profile.version === reference.version)
  }
}

export function resolveEffectiveDependencyPolicy(
  input: ResolveDependencyPolicyInput,
): DependencyPolicyDecision {
  const env = input.env ?? process.env
  if (env['SYMBOLWRIGHT_DISABLE_DEPENDENCY_ACQUISITION'] === 'true') {
    return blocked(
      'DEPENDENCY_ACQUISITION_GLOBALLY_DISABLED',
      'Dependency acquisition is disabled by the emergency kill switch.',
    )
  }

  const approvedCapabilities = input.authorization.approvedCapabilityIds.map(
    canonicalSandboxCapabilityId,
  )
  if (!approvedCapabilities.includes(SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY)) {
    return blocked(
      'DEPENDENCY_CAPABILITY_NOT_APPROVED',
      `The server authorization context does not approve ${SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY}.`,
    )
  }
  if (input.authorization.runtimeMode !== 'APPROVED_EXECUTION') {
    return blocked(
      'DEPENDENCY_RUNTIME_MODE_BLOCKED',
      `${input.authorization.runtimeMode} cannot acquire dependencies.`,
    )
  }

  const reference = input.authorization.policyReference
  if (reference === undefined) {
    return blocked(
      'DEPENDENCY_POLICY_REFERENCE_REQUIRED',
      'Dependency acquisition requires an explicit operator-owned policy reference.',
    )
  }
  const latest = input.catalog.latest(reference.id)
  if (latest === undefined) {
    return blocked(
      'DEPENDENCY_POLICY_NOT_FOUND',
      `Dependency policy ${reference.id}@${reference.version} is not installed.`,
    )
  }
  if (latest.version !== reference.version) {
    return blocked(
      'DEPENDENCY_POLICY_VERSION_STALE',
      `Dependency policy ${reference.id}@${reference.version} is stale; current version is ${latest.version}.`,
    )
  }
  const profile = input.catalog.resolve(reference)
  if (profile === undefined || !profile.enabled) {
    return blocked('DEPENDENCY_POLICY_DISABLED', 'The selected dependency policy is disabled.')
  }
  if (!profile.ecosystems.includes(input.request.ecosystem)) {
    return blocked(
      'DEPENDENCY_ECOSYSTEM_UNSUPPORTED',
      `Dependency policy ${profile.id}@${profile.version} does not support ${input.request.ecosystem}.`,
    )
  }
  if (!profile.deploymentModes.includes(input.authorization.deploymentMode)) {
    return blocked(
      'DEPENDENCY_DEPLOYMENT_NOT_ALLOWED',
      `Dependency policy ${profile.id}@${profile.version} does not allow ${input.authorization.deploymentMode} deployment.`,
    )
  }
  if (!profile.callerKinds.includes(input.authorization.callerKind)) {
    return blocked(
      'DEPENDENCY_CALLER_NOT_ALLOWED',
      `Dependency policy ${profile.id}@${profile.version} does not allow ${input.authorization.callerKind} callers.`,
    )
  }

  const globalVersion = positiveInteger(env['SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION'], 1)
  const sources = dependencyPolicySources(input.authorization, profile, globalVersion)
  const approvalFailure = validateApproval(
    input.authorization.approval,
    input.authorization.grantVersion,
    sources,
  )
  if (approvalFailure !== undefined) return approvalFailure

  const requestedRegistries =
    input.request.registryUrls === undefined
      ? profile.allowedRegistries
      : input.request.registryUrls
  if (requestedRegistries.length === 0) {
    return blocked(
      'DEPENDENCY_REGISTRY_POLICY_EMPTY',
      'The effective dependency registry allowlist is empty.',
    )
  }

  let profileRegistries: readonly string[]
  let normalizedRequested: readonly string[]
  try {
    profileRegistries = uniqueSorted(profile.allowedRegistries.map(normalizeRegistryUrl))
    normalizedRequested = uniqueSorted(requestedRegistries.map(normalizeRegistryUrl))
  } catch (error) {
    return blocked(
      'DEPENDENCY_REGISTRY_INVALID',
      error instanceof Error ? error.message : String(error),
    )
  }
  for (const registry of normalizedRequested) {
    if (!isUrlAllowedByRegistryPolicy(registry, profileRegistries)) {
      return blocked(
        'DEPENDENCY_REGISTRY_NOT_ALLOWED',
        `Registry is outside the operator-owned allowlist: ${registry}`,
      )
    }
  }

  const limits = intersectDependencyLimits(profile.limits, input.request.limits)
  const material = {
    schemaVersion: DEPENDENCY_POLICY_SCHEMA_VERSION,
    policyId: profile.id,
    policyVersion: profile.version,
    ecosystem: input.request.ecosystem,
    deploymentMode: input.authorization.deploymentMode,
    callerKind: input.authorization.callerKind,
    capabilityId: SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
    allowedRegistries: normalizedRequested,
    requireLockfile: true as const,
    allowLockfileMutation: false as const,
    suppressLifecycleScripts: true as const,
    directIpDestinations: 'denied' as const,
    cacheNamespace: profile.cacheNamespace,
    limits,
    sources,
  }
  const policy: EffectiveDependencyPolicy = deepFreeze({
    ...material,
    fingerprint: sha256(stableJson(material)),
    resolvedAt: (input.now ?? (() => new Date()))().toISOString(),
  })
  return {
    allowed: true,
    reasonCode: 'DEPENDENCY_POLICY_ALLOWED',
    reason: `Resolved ${profile.id}@${profile.version} for governed ${input.request.ecosystem} acquisition.`,
    policy,
  }
}

export function normalizeRegistryUrl(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') {
    throw new Error('Dependency registries must use HTTPS.')
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error('Dependency registry URLs must not contain credentials.')
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error('Dependency registry URLs must not contain query strings or fragments.')
  }
  if (isIP(parsed.hostname) !== 0) {
    throw new Error('Direct IP dependency registries are denied.')
  }
  const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
  return `${parsed.origin}${pathname}`
}

export function isUrlAllowedByRegistryPolicy(
  value: string,
  allowedRegistries: readonly string[],
): boolean {
  let candidate: URL
  try {
    candidate = new URL(value)
  } catch {
    return false
  }
  if (candidate.protocol !== 'https:' || isIP(candidate.hostname) !== 0) return false
  if (candidate.username.length > 0 || candidate.password.length > 0) return false

  return allowedRegistries.some((allowedValue) => {
    const allowed = new URL(allowedValue)
    if (candidate.origin !== allowed.origin) return false
    const prefix = allowed.pathname.endsWith('/') ? allowed.pathname : `${allowed.pathname}/`
    return candidate.pathname === allowed.pathname || candidate.pathname.startsWith(prefix)
  })
}

function dependencyPolicySources(
  authorization: SandboxAuthorizationContext,
  profile: DependencyPolicyProfile,
  globalVersion: number,
): readonly SandboxPolicySourceEvidence[] {
  const sources: SandboxPolicySourceEvidence[] = [
    { id: DEPENDENCY_GLOBAL_POLICY_ID, version: globalVersion, kind: 'global' },
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
  sources.push({ id: 'dependency-request-tightening', version: 1, kind: 'request' })
  return sources
}

function validateApproval(
  approval: SandboxApprovalBinding | undefined,
  grantVersion: number | undefined,
  sources: readonly SandboxPolicySourceEvidence[],
): DependencyPolicyDecision | undefined {
  if (approval === undefined) {
    return blocked(
      'DEPENDENCY_APPROVAL_REQUIRED',
      'Dependency acquisition requires a current operator approval bound to policy versions.',
    )
  }
  if (
    canonicalSandboxCapabilityId(approval.capabilityId) !== SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY
  ) {
    return blocked(
      'DEPENDENCY_APPROVAL_CAPABILITY_MISMATCH',
      'The supplied approval is bound to a different capability.',
    )
  }
  if (grantVersion !== undefined && approval.grantVersion !== grantVersion) {
    return blocked(
      'DEPENDENCY_APPROVAL_GRANT_STALE',
      'The supplied approval was issued for a different grant version.',
    )
  }
  for (const source of sources) {
    const approvedVersion = approval.policyVersions[source.id]
    if (approvedVersion === undefined) {
      return blocked(
        'DEPENDENCY_APPROVAL_POLICY_INCOMPLETE',
        `Approval is not bound to dependency policy source ${source.id}.`,
      )
    }
    if (approvedVersion !== source.version) {
      return blocked(
        'DEPENDENCY_APPROVAL_POLICY_STALE',
        `Approval policy binding ${source.id}@${approvedVersion} does not match resolved version ${source.version}.`,
      )
    }
  }
  return undefined
}

function intersectDependencyLimits(
  profile: DependencyAcquisitionLimits,
  requested: Partial<DependencyAcquisitionLimits> | undefined,
): DependencyAcquisitionLimits {
  const limit = (key: keyof DependencyAcquisitionLimits): number => {
    const value = requested?.[key]
    if (value === undefined || !Number.isFinite(value) || value <= 0) return profile[key]
    return Math.max(1, Math.floor(Math.min(profile[key], value)))
  }
  return {
    maxPackages: limit('maxPackages'),
    maxRequests: limit('maxRequests'),
    maxArchiveBytes: limit('maxArchiveBytes'),
    maxExpandedBytes: limit('maxExpandedBytes'),
    maxFiles: limit('maxFiles'),
    maxFileBytes: limit('maxFileBytes'),
    maxTotalBytes: limit('maxTotalBytes'),
    timeoutMs: limit('timeoutMs'),
    maxConcurrency: limit('maxConcurrency'),
  }
}

function validateProfile(profile: DependencyPolicyProfile): void {
  if (profile.id.trim().length === 0) throw new Error('Dependency policy id must not be empty.')
  if (!Number.isSafeInteger(profile.version) || profile.version <= 0) {
    throw new Error('Dependency policy version must be a positive integer.')
  }
  if (profile.cacheNamespace.trim().length === 0) {
    throw new Error('Dependency cache namespace must not be empty.')
  }
  for (const registry of profile.allowedRegistries) normalizeRegistryUrl(registry)
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
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

function blocked(reasonCode: string, reason: string): DependencyPolicyDecision {
  return { allowed: false, reasonCode, reason }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
