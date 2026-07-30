import type { AgentAccessGrant, SandboxPolicyReferences } from './access-types.js'
import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
  sandboxCapabilityAliases,
} from './sandbox-capabilities.js'
import {
  DEFAULT_OFFLINE_SANDBOX_POLICY_ID,
  DEFAULT_OFFLINE_SANDBOX_POLICY_VERSION,
} from '../sandbox/sandbox-policy-model.js'

export function grantAllowsOfflineSandbox(grant: AgentAccessGrant): boolean {
  return grantAllowsCapability(grant, SANDBOX_OFFLINE_EXECUTE_CAPABILITY)
}

export function grantAllowsDependencyAcquisition(grant: AgentAccessGrant): boolean {
  return grantAllowsCapability(grant, SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY)
}

export interface ResolvedGrantSandboxPolicyReferences {
  readonly references: SandboxPolicyReferences
  readonly compatibilityMode: 'explicit-policy-references' | 'legacy-offline-only'
  readonly unsupportedReason?: string
}

/**
 * Reads existing grants without widening them. Legacy `sandboxNetworkAccess: false` or an absent
 * field maps only to the default offline policy. A persisted legacy `true` value fails closed and
 * never becomes dependency acquisition or egress authority.
 */
export function resolveGrantSandboxPolicyReferences(
  grant: AgentAccessGrant,
): ResolvedGrantSandboxPolicyReferences {
  if (grant.executionLimits.sandboxNetworkAccess === true) {
    return {
      references: {},
      compatibilityMode: 'legacy-offline-only',
      unsupportedReason:
        'Legacy sandboxNetworkAccess=true is unsupported and cannot authorize sandbox execution.',
    }
  }

  if (grant.sandboxPolicyReferences !== undefined) {
    return {
      references: grant.sandboxPolicyReferences,
      compatibilityMode: 'explicit-policy-references',
    }
  }

  return {
    references: {
      offline: {
        id: DEFAULT_OFFLINE_SANDBOX_POLICY_ID,
        version: DEFAULT_OFFLINE_SANDBOX_POLICY_VERSION,
      },
    },
    compatibilityMode: 'legacy-offline-only',
  }
}

function grantAllowsCapability(grant: AgentAccessGrant, capability: string): boolean {
  const aliases = sandboxCapabilityAliases(capability)
  if (aliases.some((alias) => grant.deniedCapabilities.includes(alias))) return false
  return aliases.some(
    (alias) =>
      grant.symbolWrightCapabilities.includes(alias) || grant.githubCapabilities.includes(alias),
  )
}
