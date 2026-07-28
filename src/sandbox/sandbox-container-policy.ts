import { normalizeSandboxLimits } from './sandbox-limits.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type {
  SandboxImageDefinition,
  SandboxLimits,
  SandboxNetworkPolicy,
} from './sandbox-types.js'

export interface SandboxContainerIsolationControls {
  readonly privileged: false
  readonly hostPid: false
  readonly hostNetwork: false
  readonly socketMounts: false
  readonly homeMounts: false
  readonly repositoryMounts: false
  readonly arbitraryMounts: false
  readonly arbitraryContainerArgs: false
  readonly registryCredentials: false
  readonly rootUser: false
  readonly privilegeEscalation: false
  readonly networkPolicy: SandboxNetworkPolicy
  readonly droppedCapabilities: true
  readonly nonRootUser: true
  readonly readOnlyRootFilesystem: true
  readonly privatePidNamespace: true
  readonly privateIpcNamespace: true
  readonly temporaryWorkspaceOnly: true
  readonly tmpfsWorkspaceQuota: true
  readonly digestPinnedImage: true
  readonly pullNever: true
  readonly cleanupRequired: true
  readonly orphanReapingRequired: true
  readonly minimalEnvironment: true
  readonly resourceLimitsRequired: true
}

export interface SandboxContainerPolicyPlan {
  readonly schemaVersion: 2
  readonly imageId: string
  readonly image: string
  readonly digest?: string
  readonly engine: SandboxContainerEngineStatus
  readonly trustClass: 'container-isolated'
  readonly backend: 'container'
  readonly executionEnabled: boolean
  readonly networkPolicy: SandboxNetworkPolicy
  readonly limits: SandboxLimits
  readonly controls: SandboxContainerIsolationControls
  readonly blockedReasons: readonly string[]
  readonly warnings: readonly string[]
}

export interface SandboxContainerPolicyPlanOptions {
  readonly image: SandboxImageDefinition
  readonly engine: SandboxContainerEngineStatus
  readonly limits?: Partial<SandboxLimits>
}

export const DEFAULT_SANDBOX_CONTAINER_CONTROLS: SandboxContainerIsolationControls = {
  privileged: false,
  hostPid: false,
  hostNetwork: false,
  socketMounts: false,
  homeMounts: false,
  repositoryMounts: false,
  arbitraryMounts: false,
  arbitraryContainerArgs: false,
  registryCredentials: false,
  rootUser: false,
  privilegeEscalation: false,
  networkPolicy: 'disabled',
  droppedCapabilities: true,
  nonRootUser: true,
  readOnlyRootFilesystem: true,
  privatePidNamespace: true,
  privateIpcNamespace: true,
  temporaryWorkspaceOnly: true,
  tmpfsWorkspaceQuota: true,
  digestPinnedImage: true,
  pullNever: true,
  cleanupRequired: true,
  orphanReapingRequired: true,
  minimalEnvironment: true,
  resourceLimitsRequired: true,
}

export function buildSandboxContainerPolicyPlan(
  options: SandboxContainerPolicyPlanOptions,
): SandboxContainerPolicyPlan {
  const limits = normalizeSandboxLimits(options.limits)
  const blockedReasons = containerBlockedReasons(options.image, options.engine)
  return {
    schemaVersion: 2,
    imageId: options.image.id,
    image: options.image.image,
    ...(options.image.digest === undefined ? {} : { digest: options.image.digest }),
    engine: options.engine,
    trustClass: 'container-isolated',
    backend: 'container',
    executionEnabled: blockedReasons.length === 0,
    networkPolicy: 'disabled',
    limits,
    controls: DEFAULT_SANDBOX_CONTAINER_CONTROLS,
    blockedReasons,
    warnings: [
      'The strong container backend is offline and never pulls images during execution.',
      'Only a dedicated temporary tmpfs workspace is writable inside the container.',
      'Generated files are copied to bounded quarantine and never applied to the repository automatically.',
      'Container cleanup and boot-time orphan reaping are mandatory.',
    ],
  }
}

export function isSandboxContainerPolicyExecutable(plan: SandboxContainerPolicyPlan): boolean {
  return plan.executionEnabled && plan.blockedReasons.length === 0
}

function containerBlockedReasons(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
): readonly string[] {
  const reasons: string[] = []
  if (engine.status !== 'available' || (engine.engine !== 'docker' && engine.engine !== 'podman')) {
    reasons.push(engine.reason)
  }
  if (!image.enabled) reasons.push('Sandbox image is not enabled by operator policy.')
  if (image.installed !== true) {
    reasons.push('Sandbox image is not verified as installed in the local engine image store.')
  }
  if (
    image.digest === undefined ||
    !/^sha256:[a-f0-9]{64}$/.test(image.digest) ||
    !image.image.endsWith(`@${image.digest}`)
  ) {
    reasons.push('Sandbox image reference is not pinned to its allowlisted sha256 digest.')
  }
  return reasons
}
