export const CODEMIND_AJNA_PROOF_MATRIX_BLOCK_ID = 'CODEMIND-PROOF-HARNESS-03' as const
export const CODEMIND_AJNA_PROOF_MATRIX_PR_ID = 'PR-CM-TEST-03' as const
export const CODEMIND_AJNA_PROOF_MATRIX_PHASE_ID = 'CODEMIND-TEST-03' as const

export const CODEMIND_AJNA_PROOF_MATRIX_STATUSES = [
  'AJNA_PROOF_READY',
  'AJNA_PROOF_PARTIAL',
  'AJNA_PROOF_BLOCKED',
  'AJNA_PROOF_INVALID',
] as const
export type CodemindAjnaProofMatrixStatus = (typeof CODEMIND_AJNA_PROOF_MATRIX_STATUSES)[number]

// Structurally compatible with CodemindKernelTraceProofStatus from PR-CM-TEST-02.
type KernelTraceStatus =
  | 'TRACE_PROOF_READY'
  | 'TRACE_PROOF_PARTIAL'
  | 'TRACE_PROOF_BLOCKED'
  | 'TRACE_PROOF_INVALID'

export interface CodemindAjnaProofMatrixInput {
  readonly ajnaSpecFiles: readonly string[]
  readonly requiredSpecFiles: readonly string[]
  readonly blockingFindings?: readonly string[]
  readonly kernelTraceProofStatus?: KernelTraceStatus
}

export interface CodemindAjnaProofMatrixReport {
  readonly blockId: typeof CODEMIND_AJNA_PROOF_MATRIX_BLOCK_ID
  readonly prId: typeof CODEMIND_AJNA_PROOF_MATRIX_PR_ID
  readonly phaseId: typeof CODEMIND_AJNA_PROOF_MATRIX_PHASE_ID
  readonly status: CodemindAjnaProofMatrixStatus
  readonly coveredSpecs: readonly string[]
  readonly missingSpecs: readonly string[]
  readonly blockingFindings: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
  readonly ajnaCanDeclareMergeReady: boolean
  readonly summary: string
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function resolveStatus(
  blockingFindings: readonly string[],
  kernelTraceProofStatus: KernelTraceStatus | undefined,
  missingSpecs: readonly string[],
): CodemindAjnaProofMatrixStatus {
  if (kernelTraceProofStatus === 'TRACE_PROOF_INVALID') {
    return 'AJNA_PROOF_INVALID'
  }
  if (blockingFindings.length > 0 || kernelTraceProofStatus === 'TRACE_PROOF_BLOCKED') {
    return 'AJNA_PROOF_BLOCKED'
  }
  if (missingSpecs.length === 0) {
    return 'AJNA_PROOF_READY'
  }
  return 'AJNA_PROOF_PARTIAL'
}

export function buildCodemindAjnaProofMatrixReport(
  input: CodemindAjnaProofMatrixInput,
): CodemindAjnaProofMatrixReport {
  const requiredSpecs = uniqueSorted(input.requiredSpecFiles)
  const ajnaSpecs = new Set(input.ajnaSpecFiles)
  const blockingFindings = uniqueSorted(input.blockingFindings ?? [])

  const coveredSpecs = requiredSpecs.filter((spec) => ajnaSpecs.has(spec))
  const missingSpecs = requiredSpecs.filter((spec) => !ajnaSpecs.has(spec))

  const status = resolveStatus(blockingFindings, input.kernelTraceProofStatus, missingSpecs)

  const ajnaCanDeclareMergeReady = status === 'AJNA_PROOF_READY'

  const summary =
    status === 'AJNA_PROOF_INVALID'
      ? `Ajna proof matrix invalid: kernel trace proof status is ${input.kernelTraceProofStatus ?? 'unknown'}.`
      : status === 'AJNA_PROOF_BLOCKED'
        ? `Ajna proof matrix blocked: ${blockingFindings.length} blocking finding(s).`
        : `${coveredSpecs.length}/${requiredSpecs.length} Ajna proof specs covered.`

  return {
    blockId: CODEMIND_AJNA_PROOF_MATRIX_BLOCK_ID,
    prId: CODEMIND_AJNA_PROOF_MATRIX_PR_ID,
    phaseId: CODEMIND_AJNA_PROOF_MATRIX_PHASE_ID,
    status,
    coveredSpecs,
    missingSpecs,
    blockingFindings,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
    ajnaCanDeclareMergeReady,
    summary,
  }
}
