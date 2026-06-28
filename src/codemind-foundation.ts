export const CODEMIND_PLATFORM_NAME = 'CodeMind' as const
export const CODEMIND_AJNA_CAPABILITY_NAME = 'Ajna Review Cortex' as const

export type CodemindRuntimePosture = 'EXECUTION_FIRST' | 'PLAN_FIRST' | 'READ_ONLY_FIRST'

export interface CodemindFoundationSnapshot {
  readonly platform: typeof CODEMIND_PLATFORM_NAME
  readonly primaryCapability: typeof CODEMIND_AJNA_CAPABILITY_NAME
  readonly posture: readonly CodemindRuntimePosture[]
  readonly mutationEnabled: boolean
  readonly githubWriteEnabled: boolean
  readonly bashExecutionEnabled: boolean
  readonly networkIngestionEnabled: boolean
}

export function getCodemindFoundationSnapshot(): CodemindFoundationSnapshot {
  return {
    platform: CODEMIND_PLATFORM_NAME,
    primaryCapability: CODEMIND_AJNA_CAPABILITY_NAME,
    posture: ['PLAN_FIRST'],
    mutationEnabled: false,
    githubWriteEnabled: false,
    bashExecutionEnabled: false,
    networkIngestionEnabled: false,
  }
}
