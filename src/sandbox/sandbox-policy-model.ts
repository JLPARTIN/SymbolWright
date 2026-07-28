import { createHash } from 'node:crypto'

import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
  canonicalSandboxCapabilityId,
} from '../access/sandbox-capabilities.js'
import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import type {
  SandboxBackendKind,
  SandboxExecutionMode,
  SandboxExecutionRequest,
  SandboxLimits,
  SandboxRunnerDefinition,
  SandboxTrustClass,
} from './sandbox-types.js'

export const SANDBOX_POLICY_SCHEMA_VERSION = 1 as const
export const SANDBOX_GLOBAL_POLICY_ID = 'sandbox-global' as const
export const DEFAULT_OFFLINE_SANDBOX_POLICY_ID = 'sandbox-offline-default' as const
export const DEFAULT_OFFLINE_SANDBOX_POLICY_VERSION = 1 as const

export const SANDBOX_POLICY_INTENTS = [
  'offline-execution',
  'dependency-acquisition',
  'egress-execution',
] as const
export type SandboxPolicyIntent = (typeof SANDBOX_POLICY_INTENTS)[number]

export const SANDBOX_CALLER_KINDS = [
  'operator',
  'delegated-grant',
  'team-member',
  'system',
] as const
export type SandboxCallerKind = (typeof SANDBOX_CALLER_KINDS)[number]

export const SANDBOX_DEPLOYMENT_MODES = ['local', 'hosted'] as const
export type SandboxDeploymentMode = (typeof SANDBOX_DEPLOYMENT_MODES)[number]

export const SANDBOX_NETWORK_MODES = [
  'disabled',
  'dependency-broker-only',
  'allowlisted-egress',
  'unsupported',
] as const
export type SandboxNetworkMode = (typeof SANDBOX_NETWORK_MODES)[number]

export const SANDBOX_DEPENDENCY_MODES = ['disabled', 'brokered', 'unsupported'] as const
export type SandboxDependencyMode = (typeof SANDBOX_DEPENDENCY_MODES)[number]

export const SANDBOX_WORKSPACE_MODES = [
  'managed-mission',
  'temporary-copy',
  'trusted-local-host',
] as const
export type SandboxWorkspaceMode = (typeof SANDBOX_WORKSPACE_MODES)[number]

export const SANDBOX_ARTIFACT_EXPORT_POLICIES = [
  'none',
  'quarantine-only',
  'approved-export',
] as const
export type SandboxArtifactExportPolicy =
  (typeof SANDBOX_ARTIFACT_EXPORT_POLICIES)[number]

export interface SandboxPolicyReference {
  readonly id: string
  readonly version: number
}

export interface SandboxApprovalBinding {
  readonly id: string
  readonly capabilityId: string
  readonly grantVersion?: number
  readonly policyVersions: Readonly<Record<string, number>>
}

export interface SandboxAuthorizationContext {
  readonly deploymentMode: SandboxDeploymentMode
  readonly callerKind: SandboxCallerKind
  readonly runtimeMode: SymbolWrightRuntimeMode
  readonly approvedCapabilityIds: readonly string[]
  readonly repositoryId: string
  readonly workspaceId: string
  readonly missionId?: string
  readonly principalId?: string
  readonly grantId?: string
  readonly grantVersion?: number
  readonly approval?: SandboxApprovalBinding
  readonly policyReference?: SandboxPolicyReference
  readonly expectedPolicyVersions?: Readonly<Record<string, number>>
  readonly grantAllowedCommands?: readonly string[]
  readonly grantLimits?: Partial<SandboxLimits>
  readonly missionLimits?: Partial<SandboxLimits>
  readonly intent?: SandboxPolicyIntent
}

export interface SandboxPolicyProfile {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly allowedIntents: readonly SandboxPolicyIntent[]
  readonly deploymentModes: readonly SandboxDeploymentMode[]
  readonly callerKinds: readonly SandboxCallerKind[]
  readonly allowedBackends: readonly SandboxBackendKind[]
  readonly allowedTrustClasses: readonly SandboxTrustClass[]
  readonly allowedLanguageIds?: readonly string[]
  readonly allowedModes?: readonly SandboxExecutionMode[]
  readonly allowedCommands?: readonly string[]
  readonly limits?: Partial<SandboxLimits>
  readonly networkModes: readonly SandboxNetworkMode[]
  readonly dependencyModes: readonly SandboxDependencyMode[]
  readonly workspaceModes: readonly SandboxWorkspaceMode[]
  readonly artifactExport: SandboxArtifactExportPolicy
  readonly cleanupRequired: boolean
  readonly evidenceRequired: boolean
}

export interface SandboxPolicySourceEvidence {
  readonly id: string
  readonly version: number
  readonly kind: 'global' | 'operator-profile' | 'grant' | 'mission' | 'request' | 'runner'
}

export interface EffectiveSandboxPolicy {
  readonly schemaVersion: typeof SANDBOX_POLICY_SCHEMA_VERSION
  readonly policyId: string
  readonly policyVersion: number
  readonly fingerprint: string
  readonly resolvedAt: string
  readonly intent: SandboxPolicyIntent
  readonly requiredCapabilityId: string
  readonly deploymentMode: SandboxDeploymentMode
  readonly callerKind: SandboxCallerKind
  readonly runnerId: string
  readonly backend: SandboxBackendKind
  readonly trustClass: SandboxTrustClass
  readonly allowedLanguageIds: readonly string[]
  readonly allowedModes: readonly SandboxExecutionMode[]
  readonly allowedCommands: readonly string[]
  readonly commandPolicy: 'runner-defined' | 'allowlist'
  readonly limits: SandboxLimits
  readonly workspace: {
    readonly mode: SandboxWorkspaceMode
    readonly repositoryIdHash: string
    readonly workspaceIdHash: string
  }
  readonly network: {
    readonly mode: SandboxNetworkMode
    readonly policyId?: string
  }
  readonly dependencies: {
    readonly mode: SandboxDependencyMode
    readonly policyId?: string
  }
  readonly artifacts: {
    readonly exportPolicy: SandboxArtifactExportPolicy
  }
  readonly cleanup: {
    readonly required: boolean
  }
  readonly evidence: {
    readonly required: boolean
    readonly redactAtBoundary: true
  }
  readonly sources: readonly SandboxPolicySourceEvidence[]
}

export interface SandboxPolicyResolution {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly policy?: EffectiveSandboxPolicy
}

export interface ResolveSandboxPolicyInput {
  readonly request: SandboxExecutionRequest
  readonly runner?: SandboxRunnerDefinition
  readonly authorization: SandboxAuthorizationContext
  readonly catalog?: SandboxPolicyCatalog
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
}

export const DEFAULT_OFFLINE_SANDBOX_POLICY: SandboxPolicyProfile = {
  id: DEFAULT_OFFLINE_SANDBOX_POLICY_ID,
  version: DEFAULT_OFFLINE_SANDBOX_POLICY_VERSION,
  enabled: true,
  allowedIntents: ['offline-execution'],
  deploymentModes: ['local', 'hosted'],
  callerKinds: ['operator', 'delegated-grant', 'team-member', 'system'],
  allowedBackends: ['browser', 'container', 'wasm', 'guarded-host'],
  allowedTrustClasses: [
    'browser-isolated',
    'container-isolated',
    'wasm-isolated',
    'guarded-host',
  ],
  networkModes: ['disabled'],
  dependencyModes: ['disabled'],
  workspaceModes: ['managed-mission', 'temporary-copy', 'trusted-local-host'],
  artifactExport: 'quarantine-only',
  cleanupRequired: true,
  evidenceRequired: true,
}

export class SandboxPolicyCatalog {
  private readonly profiles: ReadonlyMap<string, readonly SandboxPolicyProfile[]>

  public constructor(profiles: readonly SandboxPolicyProfile[] = [DEFAULT_OFFLINE_SANDBOX_POLICY]) {
    const grouped = new Map<string, SandboxPolicyProfile[]>()
    for (const profile of profiles) {
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

  public resolve(reference: SandboxPolicyReference): SandboxPolicyProfile | undefined {
    return this.profiles
      .get(reference.id)
      ?.find((profile) => profile.version === reference.version)
  }

  public latest(id: string): SandboxPolicyProfile | undefined {
    return this.profiles.get(id)?.[0]
  }

  public defaultReference(intent: SandboxPolicyIntent): SandboxPolicyReference | undefined {
    if (intent !== 'offline-execution') return undefined
    return {
      id: DEFAULT_OFFLINE_SANDBOX_POLICY_ID,
      version: DEFAULT_OFFLINE_SANDBOX_POLICY_VERSION,
    }
  }
}

export function requiredCapabilityForSandboxIntent(intent: SandboxPolicyIntent): string {
  switch (intent) {
    case 'offline-execution':
      return SANDBOX_OFFLINE_EXECUTE_CAPABILITY
    case 'dependency-acquisition':
      return SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY
    case 'egress-execution':
      return SANDBOX_EGRESS_CAPABILITY
  }
}

export function resolveEffectiveSandboxPolicy(
  input: ResolveSandboxPolicyInput,
): SandboxPolicyResolution {
  const env = input.env ?? process.env
  if (env['SYMBOLWRIGHT_DISABLE_SANDBOX_EXECUTION'] === 'true') {
    return blocked(
      'SANDBOX_GLOBALLY_DISABLED',
      'Sandbox execution is disabled by the emergency global kill switch.',
    )
  }

  const intent = input.authorization.intent ?? 'offline-execution'
  const requiredCapabilityId = requiredCapabilityForSandboxIntent(intent)
  const approvedCapabilities = input.authorization.approvedCapabilityIds.map(
    canonicalSandboxCapabilityId,
  )
  if (!approvedCapabilities.includes(requiredCapabilityId)) {
    return blocked(
      'SANDBOX_CAPABILITY_NOT_APPROVED',
      `The server authorization context does not approve ${requiredCapabilityId}.`,
    )
  }

  if (
    input.authorization.runtimeMode === 'READ_ONLY' ||
    input.authorization.runtimeMode === 'PLAN_ONLY' ||
    input.authorization.runtimeMode === 'PROPOSAL_ONLY'
  ) {
    return blocked(
      'SANDBOX_RUNTIME_MODE_BLOCKED',
      `${input.authorization.runtimeMode} cannot execute sandbox code.`,
    )
  }

  const runner = input.runner
  if (runner === undefined) {
    return blocked('SANDBOX_RUNNER_NOT_FOUND', 'No matching sandbox runner is available.')
  }

  const catalog = input.catalog ?? new SandboxPolicyCatalog()
  const reference = input.authorization.policyReference ?? catalog.defaultReference(intent)
  if (reference === undefined) {
    return blocked(
      'SANDBOX_POLICY_REFERENCE_REQUIRED',
      `No server-owned policy reference is configured for ${intent}.`,
    )
  }

  const latestProfile = catalog.latest(reference.id)
  if (latestProfile === undefined) {
    return blocked(
      'SANDBOX_POLICY_NOT_FOUND',
      `Sandbox policy ${reference.id}@${reference.version} is not installed.`,
    )
  }
  if (latestProfile.version !== reference.version) {
    return blocked(
      'SANDBOX_POLICY_VERSION_STALE',
      `Sandbox policy ${reference.id}@${reference.version} is stale; current version is ${latestProfile.version}.`,
    )
  }
  const profile = catalog.resolve(reference)
  if (profile === undefined || !profile.enabled) {
    return blocked('SANDBOX_POLICY_DISABLED', 'The selected sandbox policy is disabled.')
  }

  const globalVersion = positiveInteger(
    env['SYMBOLWRIGHT_SANDBOX_GLOBAL_POLICY_VERSION'],
    1,
  )
  const sources: SandboxPolicySourceEvidence[] = [
    { id: SANDBOX_GLOBAL_POLICY_ID, version: globalVersion, kind: 'global' },
    { id: profile.id, version: profile.version, kind: 'operator-profile' },
    { id: `runner:${runner.id}`, version: 1, kind: 'runner' },
  ]
  if (input.authorization.grantId !== undefined) {
    sources.push({
      id: `grant:${input.authorization.grantId}`,
      version: input.authorization.grantVersion ?? 1,
      kind: 'grant',
    })
  }
  if (input.authorization.missionId !== undefined) {
    sources.push({ id: `mission:${input.authorization.missionId}`, version: 1, kind: 'mission' })
  }
  sources.push({ id: 'request-tightening', version: 1, kind: 'request' })

  const staleExpected = findStaleVersion(
    sources,
    input.authorization.expectedPolicyVersions,
  )
  if (staleExpected !== undefined) {
    return blocked(
      'SANDBOX_POLICY_VERSION_STALE',
      `Expected ${staleExpected.id}@${staleExpected.expected}, but resolved version ${staleExpected.actual}.`,
    )
  }

  if (intent !== 'offline-execution') {
    const approvalFailure = validateApprovalBinding(
      input.authorization,
      requiredCapabilityId,
      sources,
    )
    if (approvalFailure !== undefined) return approvalFailure
  }

  if (!profile.allowedIntents.includes(intent)) {
    return blocked(
      'SANDBOX_INTENT_NOT_ALLOWED',
      `Policy ${profile.id}@${profile.version} does not allow ${intent}.`,
    )
  }
  if (!profile.deploymentModes.includes(input.authorization.deploymentMode)) {
    return blocked(
      'SANDBOX_DEPLOYMENT_NOT_ALLOWED',
      `Policy ${profile.id}@${profile.version} does not allow ${input.authorization.deploymentMode} deployment.`,
    )
  }
  if (!profile.callerKinds.includes(input.authorization.callerKind)) {
    return blocked(
      'SANDBOX_CALLER_NOT_ALLOWED',
      `Policy ${profile.id}@${profile.version} does not allow ${input.authorization.callerKind} callers.`,
    )
  }
  if (!profile.allowedBackends.includes(runner.backend)) {
    return blocked(
      'SANDBOX_BACKEND_NOT_ALLOWED',
      `Policy ${profile.id}@${profile.version} does not allow backend ${runner.backend}.`,
    )
  }
  if (!profile.allowedTrustClasses.includes(runner.trustClass)) {
    return blocked(
      'SANDBOX_TRUST_CLASS_NOT_ALLOWED',
      `Policy ${profile.id}@${profile.version} does not allow trust class ${runner.trustClass}.`,
    )
  }

  if (runner.trustClass === 'guarded-host') {
    if (input.authorization.deploymentMode === 'hosted') {
      return blocked(
        'GUARDED_HOST_HOSTED_FORBIDDEN',
        'Trusted local host execution is forbidden in hosted deployment mode.',
      )
    }
    if (input.authorization.callerKind !== 'operator') {
      return blocked(
        'GUARDED_HOST_CALLER_FORBIDDEN',
        'Trusted local host execution is restricted to the local operator break-glass path.',
      )
    }
  }

  const allowedLanguageIds = intersectDefined([
    runner.languageIds,
    profile.allowedLanguageIds,
  ])
  if (!allowedLanguageIds.includes(input.request.languageId)) {
    return blocked(
      'SANDBOX_LANGUAGE_NOT_ALLOWED',
      `Language ${input.request.languageId} is not allowed by the effective policy.`,
    )
  }

  const runnerModes = supportedRunnerModes(runner)
  const allowedModes = intersectDefined([runnerModes, profile.allowedModes])
  if (!allowedModes.includes(input.request.mode)) {
    return blocked(
      'SANDBOX_MODE_NOT_ALLOWED',
      `Execution mode ${input.request.mode} is not allowed by the effective policy.`,
    )
  }

  const allowedCommands = intersectOptionalAllowlists([
    profile.allowedCommands,
    input.authorization.grantAllowedCommands,
  ])
  const workspaceMode = resolveWorkspaceMode(input.request, runner)
  if (!profile.workspaceModes.includes(workspaceMode)) {
    return blocked(
      'SANDBOX_WORKSPACE_MODE_NOT_ALLOWED',
      `Workspace mode ${workspaceMode} is not allowed by the effective policy.`,
    )
  }

  const networkMode = requiredNetworkMode(intent)
  if (!profile.networkModes.includes(networkMode)) {
    return blocked(
      'SANDBOX_NETWORK_POLICY_UNAVAILABLE',
      `Policy ${profile.id}@${profile.version} cannot enforce network mode ${networkMode}.`,
    )
  }
  const dependencyMode = requiredDependencyMode(intent)
  if (!profile.dependencyModes.includes(dependencyMode)) {
    return blocked(
      'SANDBOX_DEPENDENCY_POLICY_UNAVAILABLE',
      `Policy ${profile.id}@${profile.version} cannot enforce dependency mode ${dependencyMode}.`,
    )
  }

  const limits = intersectSandboxLimits([
    DEFAULT_SANDBOX_LIMITS,
    profile.limits,
    runner.limits,
    input.authorization.grantLimits,
    input.authorization.missionLimits,
    input.request.limits,
  ])

  const material = {
    schemaVersion: SANDBOX_POLICY_SCHEMA_VERSION,
    policyId: profile.id,
    policyVersion: profile.version,
    intent,
    requiredCapabilityId,
    deploymentMode: input.authorization.deploymentMode,
    callerKind: input.authorization.callerKind,
    runnerId: runner.id,
    backend: runner.backend,
    trustClass: runner.trustClass,
    allowedLanguageIds,
    allowedModes,
    allowedCommands,
    commandPolicy: allowedCommands.length === 0 ? ('runner-defined' as const) : ('allowlist' as const),
    limits,
    workspace: {
      mode: workspaceMode,
      repositoryIdHash: sha256(input.authorization.repositoryId),
      workspaceIdHash: sha256(input.authorization.workspaceId),
    },
    network: {
      mode: networkMode,
      ...(networkMode === 'disabled' ? {} : { policyId: profile.id }),
    },
    dependencies: {
      mode: dependencyMode,
      ...(dependencyMode === 'disabled' ? {} : { policyId: profile.id }),
    },
    artifacts: { exportPolicy: profile.artifactExport },
    cleanup: { required: profile.cleanupRequired },
    evidence: { required: profile.evidenceRequired, redactAtBoundary: true as const },
    sources,
  }
  const policy: EffectiveSandboxPolicy = deepFreeze({
    ...material,
    fingerprint: sha256(stableJson(material)),
    resolvedAt: (input.now ?? (() => new Date()))().toISOString(),
  })

  return {
    allowed: true,
    reasonCode: 'SANDBOX_POLICY_ALLOWED',
    reason: `Resolved ${profile.id}@${profile.version} by strict policy intersection.`,
    policy,
  }
}

function validateApprovalBinding(
  authorization: SandboxAuthorizationContext,
  requiredCapabilityId: string,
  sources: readonly SandboxPolicySourceEvidence[],
): SandboxPolicyResolution | undefined {
  const approval = authorization.approval
  if (approval === undefined) {
    return blocked(
      'SANDBOX_APPROVAL_REQUIRED',
      `${requiredCapabilityId} requires a current operator approval bound to policy versions.`,
    )
  }
  if (canonicalSandboxCapabilityId(approval.capabilityId) !== requiredCapabilityId) {
    return blocked(
      'SANDBOX_APPROVAL_CAPABILITY_MISMATCH',
      'The supplied approval is bound to a different capability.',
    )
  }
  if (
    authorization.grantVersion !== undefined &&
    approval.grantVersion !== authorization.grantVersion
  ) {
    return blocked(
      'SANDBOX_APPROVAL_GRANT_STALE',
      'The supplied approval was issued for a different grant version.',
    )
  }
  const stale = findStaleVersion(sources, approval.policyVersions)
  if (stale !== undefined) {
    return blocked(
      'SANDBOX_APPROVAL_POLICY_STALE',
      `Approval policy binding ${stale.id}@${stale.expected} does not match resolved version ${stale.actual}.`,
    )
  }
  for (const source of sources) {
    if (approval.policyVersions[source.id] === undefined) {
      return blocked(
        'SANDBOX_APPROVAL_POLICY_INCOMPLETE',
        `Approval is not bound to resolved policy source ${source.id}.`,
      )
    }
  }
  return undefined
}

function findStaleVersion(
  sources: readonly SandboxPolicySourceEvidence[],
  expected: Readonly<Record<string, number>> | undefined,
): { readonly id: string; readonly expected: number; readonly actual: number } | undefined {
  if (expected === undefined) return undefined
  for (const source of sources) {
    const expectedVersion = expected[source.id]
    if (expectedVersion !== undefined && expectedVersion !== source.version) {
      return { id: source.id, expected: expectedVersion, actual: source.version }
    }
  }
  return undefined
}

function requiredNetworkMode(intent: SandboxPolicyIntent): SandboxNetworkMode {
  if (intent === 'dependency-acquisition') return 'dependency-broker-only'
  if (intent === 'egress-execution') return 'allowlisted-egress'
  return 'disabled'
}

function requiredDependencyMode(intent: SandboxPolicyIntent): SandboxDependencyMode {
  return intent === 'dependency-acquisition' ? 'brokered' : 'disabled'
}

function resolveWorkspaceMode(
  request: SandboxExecutionRequest,
  runner: SandboxRunnerDefinition,
): SandboxWorkspaceMode {
  if (runner.trustClass === 'guarded-host') return 'trusted-local-host'
  return request.repository === undefined ? 'temporary-copy' : 'managed-mission'
}

function supportedRunnerModes(runner: SandboxRunnerDefinition): readonly SandboxExecutionMode[] {
  const modes: SandboxExecutionMode[] = []
  if (runner.capabilities.run) modes.push('run')
  if (runner.capabilities.compile) modes.push('compile')
  if (runner.capabilities.test) modes.push('test')
  return modes
}

function intersectSandboxLimits(layers: readonly (Partial<SandboxLimits> | undefined)[]): SandboxLimits {
  const values = <K extends keyof SandboxLimits>(key: K): number[] =>
    layers
      .map((layer) => layer?.[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  const required = <K extends Exclude<keyof SandboxLimits, 'maxCpuPercent'>>(key: K): number =>
    Math.floor(Math.min(...values(key)))
  const cpuValues = values('maxCpuPercent')

  return {
    timeoutMs: required('timeoutMs'),
    compileTimeoutMs: required('compileTimeoutMs'),
    maxMemoryMb: required('maxMemoryMb'),
    ...(cpuValues.length === 0 ? {} : { maxCpuPercent: Math.floor(Math.min(...cpuValues)) }),
    maxProcesses: required('maxProcesses'),
    maxOutputBytes: required('maxOutputBytes'),
    maxArtifactBytes: required('maxArtifactBytes'),
    maxFiles: required('maxFiles'),
    maxFileBytes: required('maxFileBytes'),
    maxTotalSourceBytes: required('maxTotalSourceBytes'),
    maxStdinBytes: required('maxStdinBytes'),
    maxArgs: required('maxArgs'),
    maxArgBytes: required('maxArgBytes'),
  }
}

function intersectDefined<T>(layers: readonly (readonly T[] | undefined)[]): readonly T[] {
  const defined = layers.filter((layer): layer is readonly T[] => layer !== undefined)
  if (defined.length === 0) return []
  let result = [...(defined[0] ?? [])]
  for (const layer of defined.slice(1)) {
    const allowed = new Set(layer)
    result = result.filter((entry) => allowed.has(entry))
  }
  return result
}

function intersectOptionalAllowlists(
  layers: readonly (readonly string[] | undefined)[],
): readonly string[] {
  const restricted = layers.filter(
    (layer): layer is readonly string[] => layer !== undefined && layer.length > 0,
  )
  return restricted.length === 0 ? [] : intersectDefined(restricted)
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortObject(value))
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObject(entry)]),
  )
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function blocked(reasonCode: string, reason: string): SandboxPolicyResolution {
  return { allowed: false, reasonCode, reason }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
