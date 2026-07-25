export const AJNA_PROOF_BUNDLE_BLOCK_ID = 'SYMBOLWRIGHT-AJNA-REVIEW-09' as const
export const AJNA_PROOF_BUNDLE_PR_ID = 'PR-CM-AJNA-09' as const
export const AJNA_PROOF_BUNDLE_PHASE_ID = 'SYMBOLWRIGHT-AJNA-09' as const

export const AJNA_PROOF_GATE_STATUSES = ['PROOF_GATE_OPEN', 'PROOF_GATE_CLOSED'] as const
export type AjnaProofGateStatus = (typeof AJNA_PROOF_GATE_STATUSES)[number]

export interface AjnaProofBundleInput {
  readonly kernelTraceStatus?: string
  readonly ajnaMatrixStatus?: string
  readonly repoContextStatus?: string
  readonly governanceStatus?: string
  readonly runtimeBoundaryStatus?: string
  readonly githubAdapterStatus?: string
}

export interface AjnaProofBundle {
  readonly blockId: typeof AJNA_PROOF_BUNDLE_BLOCK_ID
  readonly prId: typeof AJNA_PROOF_BUNDLE_PR_ID
  readonly phaseId: typeof AJNA_PROOF_BUNDLE_PHASE_ID
  readonly kernelTraceStatus: string
  readonly ajnaMatrixStatus: string
  readonly repoContextStatus: string
  readonly governanceStatus: string
  readonly runtimeBoundaryStatus: string
  readonly githubAdapterStatus: string
  readonly proofGateStatus: AjnaProofGateStatus
  readonly missingProofDomains: readonly string[]
  readonly blockingProofDomains: readonly string[]
  readonly invalidProofDomains: readonly string[]
  readonly allProofReady: boolean
}

const READY_VALUES = {
  kernelTrace: 'TRACE_PROOF_READY',
  ajnaMatrix: 'AJNA_PROOF_READY',
  repoContext: 'REPO_CONTEXT_PROOF_READY',
  governance: 'GOVERNANCE_PROOF_READY',
  runtimeBoundary: 'RUNTIME_BOUNDARY_PROOF_READY',
  githubAdapter: 'GITHUB_ADAPTER_PROOF_READY',
} as const

const DOMAIN_LABELS = [
  'kernelTrace',
  'ajnaMatrix',
  'repoContext',
  'governance',
  'runtimeBoundary',
  'githubAdapter',
] as const

type DomainLabel = (typeof DOMAIN_LABELS)[number]

const MISSING_SENTINEL = 'MISSING'

export function buildAjnaProofBundle(input: AjnaProofBundleInput): AjnaProofBundle {
  const statuses: Record<DomainLabel, string> = {
    kernelTrace: input.kernelTraceStatus ?? MISSING_SENTINEL,
    ajnaMatrix: input.ajnaMatrixStatus ?? MISSING_SENTINEL,
    repoContext: input.repoContextStatus ?? MISSING_SENTINEL,
    governance: input.governanceStatus ?? MISSING_SENTINEL,
    runtimeBoundary: input.runtimeBoundaryStatus ?? MISSING_SENTINEL,
    githubAdapter: input.githubAdapterStatus ?? MISSING_SENTINEL,
  }

  const missingProofDomains: string[] = []
  const blockingProofDomains: string[] = []
  const invalidProofDomains: string[] = []

  for (const label of DOMAIN_LABELS) {
    const status = statuses[label]
    if (status === MISSING_SENTINEL) {
      missingProofDomains.push(label)
    } else if (status.includes('BLOCKED')) {
      blockingProofDomains.push(label)
    } else if (status.includes('INVALID')) {
      invalidProofDomains.push(label)
    }
  }

  const gateOpen =
    missingProofDomains.length === 0 &&
    blockingProofDomains.length === 0 &&
    invalidProofDomains.length === 0 &&
    DOMAIN_LABELS.every((label) => statuses[label] === READY_VALUES[label])

  return {
    blockId: AJNA_PROOF_BUNDLE_BLOCK_ID,
    prId: AJNA_PROOF_BUNDLE_PR_ID,
    phaseId: AJNA_PROOF_BUNDLE_PHASE_ID,
    kernelTraceStatus: statuses.kernelTrace,
    ajnaMatrixStatus: statuses.ajnaMatrix,
    repoContextStatus: statuses.repoContext,
    governanceStatus: statuses.governance,
    runtimeBoundaryStatus: statuses.runtimeBoundary,
    githubAdapterStatus: statuses.githubAdapter,
    proofGateStatus: gateOpen ? 'PROOF_GATE_OPEN' : 'PROOF_GATE_CLOSED',
    missingProofDomains,
    blockingProofDomains,
    invalidProofDomains,
    allProofReady: gateOpen,
  }
}
