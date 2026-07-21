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
  readonly arbitraryMounts: false
  readonly arbitraryContainerArgs: false
  readonly registryCredentials: false
  readonly rootUser: false
  readonly privilegeEscalation: false
  readonly networkPolicy: SandboxNetworkPolicy
  readonly droppedCapabilities: true
  readonly nonRootUser: true
  readonly readOnlyRootFilesystem: true
  readonly temporaryWorkspaceOnly: true
  readonly cleanupRequired: true
  readonly minimalEnvironment: true
  readonly resourceLimitsRequired: true
}

export interface SandboxContainerPolicyPlan {
  readonly schemaVersion: 1
  readonly imageId: string
  readonly image: string
  readonly engine: SandboxContainerEngineStatus
  readonly trustClass: 'container-isolated'
  readonly backend: 'container'
  readonly executionEnabled: false
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
  arbitraryMounts: false,
  arbitraryContainerArgs: false,
  registryCredentials: false,
  rootUser: false,
  privilegeEscalation: false,
  networkPolicy: 'disabled',
  droppedCapabilities: true,
  nonRootUser: true,
  readOnlyRootFilesystem: true,
  temporaryWorkspaceOnly: true,
  cleanupRequired: true,
  minimalEnvironment: true,
  resourceLimitsRequired: true,
}

function containerBlockedReasons(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
): readonly string[] {
  const reasons: string[] = []
  if (engine.status !== 'available') reasons.push(engine.reason)
  if (!image.enabled) reasons.push('Sandbox image is allowlisted but not enabled for execution.')
  if (image.installed !== true) {
    reasons.push('Sandbox image is not confirmed installed by read-only local inspection.')
  }
  reasons.push(
    'Container execution remains disabled until the backend runner enforces this policy.',
  )
  return reasons
}

export function buildSandboxContainerPolicyPlan(
  options: SandboxContainerPolicyPlanOptions,
): SandboxContainerPolicyPlan {
  const limits = normalizeSandboxLimits(options.limits)
  return {
    schemaVersion: 1,
    imageId: options.image.id,
    image: options.image.image,
    engine: options.engine,
    trustClass: 'container-isolated',
    backend: 'container',
    executionEnabled: false,
    networkPolicy: 'disabled',
    limits,
    controls: DEFAULT_SANDBOX_CONTAINER_CONTROLS,
    blockedReasons: containerBlockedReasons(options.image, options.engine),
    warnings: [
      'This policy plan is not a container execution backend.',
      'No container is created, started, pulled, or inspected by this policy plan.',
      'Network access is disabled by default and cannot be opened by browser requests.',
      'Container execution must use an isolated temporary workspace outside the repository.',
      'Generated files must not be copied into the repository automatically.',
    ],
  }
}

export function isSandboxContainerPolicyExecutable(plan: SandboxContainerPolicyPlan): false {
  void plan
  return false
}
