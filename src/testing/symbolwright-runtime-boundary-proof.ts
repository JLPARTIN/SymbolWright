export const SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-06' as const
export const SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_PR_ID = 'PR-CM-TEST-06' as const
export const SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_PHASE_ID = 'SYMBOLWRIGHT-TEST-06' as const

export const SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_STATUSES = [
  'RUNTIME_BOUNDARY_PROOF_READY',
  'RUNTIME_BOUNDARY_PROOF_PARTIAL',
  'RUNTIME_BOUNDARY_PROOF_BLOCKED',
  'RUNTIME_BOUNDARY_PROOF_INVALID',
] as const
export type SymbolWrightRuntimeBoundaryProofStatus =
  (typeof SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_STATUSES)[number]

/** All seven boundary flags that must remain false at runtime. */
export interface SymbolWrightRuntimeBoundaryFlags {
  readonly providerInvocationAllowed: boolean
  readonly repoMutationAllowed: boolean
  readonly commandExecutionAllowed: boolean
  readonly githubWriteAllowed: boolean
  readonly mergeAutomationAllowed: boolean
  readonly persistentMemoryWriteAllowed: boolean
  readonly automaticSkillPromotionAllowed: boolean
}

export interface SymbolWrightRuntimeBoundaryProofInput {
  readonly flags: SymbolWrightRuntimeBoundaryFlags
  /** Names of operator-approval gates that must be present. */
  readonly requiredGates: readonly string[]
  /** Names of gates actually registered in the runtime. */
  readonly presentGates: readonly string[]
  readonly blockingNotes?: readonly string[]
}

export interface SymbolWrightRuntimeBoundaryProofReport {
  readonly blockId: typeof SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_BLOCK_ID
  readonly prId: typeof SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_PR_ID
  readonly phaseId: typeof SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_PHASE_ID
  readonly status: SymbolWrightRuntimeBoundaryProofStatus
  readonly flagViolations: readonly string[]
  readonly missingGates: readonly string[]
  readonly blockingNotes: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
  readonly summary: string
}

const FLAG_NAMES: ReadonlyArray<keyof SymbolWrightRuntimeBoundaryFlags> = [
  'providerInvocationAllowed',
  'repoMutationAllowed',
  'commandExecutionAllowed',
  'githubWriteAllowed',
  'mergeAutomationAllowed',
  'persistentMemoryWriteAllowed',
  'automaticSkillPromotionAllowed',
]

function collectFlagViolations(flags: SymbolWrightRuntimeBoundaryFlags): readonly string[] {
  return FLAG_NAMES.filter((name) => flags[name] === true).map(
    (name) => `${name} must be false but is true.`,
  )
}

function resolveStatus(
  blockingNotes: readonly string[],
  flagViolations: readonly string[],
  missingGates: readonly string[],
): SymbolWrightRuntimeBoundaryProofStatus {
  if (blockingNotes.length > 0) {
    return 'RUNTIME_BOUNDARY_PROOF_BLOCKED'
  }
  if (flagViolations.length > 0) {
    return 'RUNTIME_BOUNDARY_PROOF_INVALID'
  }
  if (missingGates.length > 0) {
    return 'RUNTIME_BOUNDARY_PROOF_PARTIAL'
  }
  return 'RUNTIME_BOUNDARY_PROOF_READY'
}

export function buildSymbolWrightRuntimeBoundaryProofReport(
  input: SymbolWrightRuntimeBoundaryProofInput,
): SymbolWrightRuntimeBoundaryProofReport {
  const blockingNotes = [...(input.blockingNotes ?? [])].sort((a, b) => a.localeCompare(b))

  const flagViolations = collectFlagViolations(input.flags)

  const presentGateSet = new Set(input.presentGates)
  const missingGates = input.requiredGates.filter((gate) => !presentGateSet.has(gate))

  const status = resolveStatus(blockingNotes, flagViolations, missingGates)

  const summary =
    status === 'RUNTIME_BOUNDARY_PROOF_BLOCKED'
      ? `Runtime boundary proof blocked: ${blockingNotes.length} blocking note(s).`
      : status === 'RUNTIME_BOUNDARY_PROOF_INVALID'
        ? `Runtime boundary proof invalid: ${flagViolations.length} flag violation(s).`
        : status === 'RUNTIME_BOUNDARY_PROOF_PARTIAL'
          ? `Runtime boundary proof partial: ${missingGates.length} required gate(s) missing.`
          : 'Runtime boundary proof ready: all flags false and all required gates present.'

  return {
    blockId: SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_BLOCK_ID,
    prId: SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_PR_ID,
    phaseId: SYMBOLWRIGHT_RUNTIME_BOUNDARY_PROOF_PHASE_ID,
    status,
    flagViolations,
    missingGates,
    blockingNotes,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
    summary,
  }
}
