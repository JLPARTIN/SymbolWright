import type { DependencyPolicyProfile } from '../../sandbox/dependency-policy.js'
import type { EgressPolicyProfile } from '../../sandbox/egress-policy.js'
import { getOrCreateApplicationSandboxNetworkRuntime } from '../../sandbox/sandbox-network-runtime.js'
import type { SandboxPolicyReference } from '../../sandbox/sandbox-policy-model.js'

interface RedactedDependencyProfile {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly ecosystems: readonly string[]
  readonly deploymentModes: readonly string[]
  readonly callerKinds: readonly string[]
  readonly allowedRegistries: readonly string[]
}

interface RedactedEgressProfile {
  readonly id: string
  readonly version: number
  readonly enabled: boolean
  readonly deploymentModes: readonly string[]
  readonly callerKinds: readonly string[]
  readonly allowedHosts: readonly string[]
  readonly allowedMethods: readonly string[]
  readonly redirectPolicy: string
  readonly credentialPolicy: string
  readonly requireTls: boolean
}

export interface SandboxNetworkControlPlaneStatus {
  readonly mode: 'offline-only' | 'configured'
  readonly dependency: {
    readonly profileCount: number
    readonly defaultPolicy: SandboxPolicyReference | undefined
    readonly profiles: readonly RedactedDependencyProfile[]
  }
  readonly egress: {
    readonly profileCount: number
    readonly defaultPolicy: SandboxPolicyReference | undefined
    readonly profiles: readonly RedactedEgressProfile[]
    readonly metrics: ReturnType<
      ReturnType<
        typeof getOrCreateApplicationSandboxNetworkRuntime
      >['gateway']['egressMetricsSnapshot']
    >
  }
}

function redactDependencyProfile(profile: DependencyPolicyProfile): RedactedDependencyProfile {
  return {
    id: profile.id,
    version: profile.version,
    enabled: profile.enabled,
    ecosystems: profile.ecosystems,
    deploymentModes: profile.deploymentModes,
    callerKinds: profile.callerKinds,
    allowedRegistries: profile.allowedRegistries,
  }
}

function redactEgressProfile(profile: EgressPolicyProfile): RedactedEgressProfile {
  return {
    id: profile.id,
    version: profile.version,
    enabled: profile.enabled,
    deploymentModes: profile.deploymentModes,
    callerKinds: profile.callerKinds,
    allowedHosts: profile.allowedHosts,
    allowedMethods: profile.allowedMethods,
    redirectPolicy: profile.redirectPolicy,
    credentialPolicy: profile.credentialPolicy,
    requireTls: profile.requireTls,
  }
}

/**
 * Builds the operator-only sandbox network control-plane summary: policy inventory and live
 * egress metrics, never a state-root path, policy file path, or any credential/secret material.
 */
export function buildSandboxNetworkControlPlaneStatus(
  workspaceRoot: string,
): SandboxNetworkControlPlaneStatus {
  const runtime = getOrCreateApplicationSandboxNetworkRuntime({ workspaceRoot })
  return {
    mode: runtime.status.mode,
    dependency: {
      profileCount: runtime.status.dependencyProfileCount,
      defaultPolicy: runtime.defaultDependencyPolicyReference,
      profiles: runtime.dependencyProfiles.map(redactDependencyProfile),
    },
    egress: {
      profileCount: runtime.status.egressProfileCount,
      defaultPolicy: runtime.defaultEgressPolicyReference,
      profiles: runtime.egressProfiles.map(redactEgressProfile),
      metrics: runtime.gateway.egressMetricsSnapshot(),
    },
  }
}
