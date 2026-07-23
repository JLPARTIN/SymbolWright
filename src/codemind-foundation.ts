import { CODETELLIGENCE_PLATFORM_NAME } from './brand/identity.js'

export { CODETELLIGENCE_PLATFORM_NAME } from './brand/identity.js'

export const CODETELLIGENCE_AJNA_CAPABILITY_NAME = 'Ajna Review Cortex' as const

/** @deprecated Use CODETELLIGENCE_PLATFORM_NAME. */
export const CODEMIND_PLATFORM_NAME = CODETELLIGENCE_PLATFORM_NAME
/** @deprecated Use CODETELLIGENCE_AJNA_CAPABILITY_NAME. */
export const CODEMIND_AJNA_CAPABILITY_NAME = CODETELLIGENCE_AJNA_CAPABILITY_NAME

export type CodetelligenceRuntimePosture = 'DIRECT_EXECUTION'
/** @deprecated Use CodetelligenceRuntimePosture. */
export type CodemindRuntimePosture = CodetelligenceRuntimePosture

export interface CodetelligenceFoundationSnapshot {
  readonly platform: typeof CODETELLIGENCE_PLATFORM_NAME
  readonly primaryCapability: typeof CODETELLIGENCE_AJNA_CAPABILITY_NAME
  readonly posture: readonly CodetelligenceRuntimePosture[]
  readonly mutationEnabled: boolean
  readonly githubWriteEnabled: boolean
  readonly bashExecutionEnabled: boolean
  readonly networkIngestionEnabled: boolean
}

/** @deprecated Use CodetelligenceFoundationSnapshot. */
export type CodemindFoundationSnapshot = CodetelligenceFoundationSnapshot

export function getCodetelligenceFoundationSnapshot(): CodetelligenceFoundationSnapshot {
  return {
    platform: CODETELLIGENCE_PLATFORM_NAME,
    primaryCapability: CODETELLIGENCE_AJNA_CAPABILITY_NAME,
    posture: ['DIRECT_EXECUTION'],
    mutationEnabled: true,
    githubWriteEnabled: true,
    bashExecutionEnabled: true,
    networkIngestionEnabled: true,
  }
}

/** @deprecated Use getCodetelligenceFoundationSnapshot. */
export const getCodemindFoundationSnapshot = getCodetelligenceFoundationSnapshot
