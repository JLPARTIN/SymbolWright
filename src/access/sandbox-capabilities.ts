export const LEGACY_SANDBOX_EXECUTE_CAPABILITY = 'symbolwright.sandbox.execute' as const
export const SANDBOX_OFFLINE_EXECUTE_CAPABILITY =
  'symbolwright.sandbox.execute.offline' as const
export const SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY =
  'symbolwright.dependencies.acquire' as const
export const SANDBOX_EGRESS_CAPABILITY = 'symbolwright.sandbox.egress' as const

export const SANDBOX_CAPABILITY_IDS = [
  LEGACY_SANDBOX_EXECUTE_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
] as const

export type SandboxCapabilityId = (typeof SANDBOX_CAPABILITY_IDS)[number]

/**
 * The original sandbox capability is a compatibility alias for offline execution only. It never
 * authorizes dependency acquisition or runtime egress.
 */
export function canonicalSandboxCapabilityId(capabilityId: string): string {
  return capabilityId === LEGACY_SANDBOX_EXECUTE_CAPABILITY
    ? SANDBOX_OFFLINE_EXECUTE_CAPABILITY
    : capabilityId
}

export function sandboxCapabilityAliases(capabilityId: string): readonly string[] {
  const canonical = canonicalSandboxCapabilityId(capabilityId)
  return canonical === SANDBOX_OFFLINE_EXECUTE_CAPABILITY
    ? [SANDBOX_OFFLINE_EXECUTE_CAPABILITY, LEGACY_SANDBOX_EXECUTE_CAPABILITY]
    : [canonical]
}
