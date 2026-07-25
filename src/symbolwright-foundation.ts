export const SYMBOLWRIGHT_PLATFORM_NAME = 'SymbolWright' as const
export const SYMBOLWRIGHT_AJNA_CAPABILITY_NAME = 'Ajna Review Cortex' as const

export type SymbolWrightRuntimePosture = 'DIRECT_EXECUTION'

export interface SymbolWrightFoundationSnapshot {
  readonly platform: typeof SYMBOLWRIGHT_PLATFORM_NAME
  readonly primaryCapability: typeof SYMBOLWRIGHT_AJNA_CAPABILITY_NAME
  readonly posture: readonly SymbolWrightRuntimePosture[]
  readonly mutationEnabled: boolean
  readonly githubWriteEnabled: boolean
  readonly bashExecutionEnabled: boolean
  readonly networkIngestionEnabled: boolean
}

export function getSymbolWrightFoundationSnapshot(): SymbolWrightFoundationSnapshot {
  return {
    platform: SYMBOLWRIGHT_PLATFORM_NAME,
    primaryCapability: SYMBOLWRIGHT_AJNA_CAPABILITY_NAME,
    posture: ['DIRECT_EXECUTION'],
    mutationEnabled: true,
    githubWriteEnabled: true,
    bashExecutionEnabled: true,
    networkIngestionEnabled: true,
  }
}
