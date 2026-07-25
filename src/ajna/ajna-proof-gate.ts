export const AJNA_PROOF_GATE_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-10' as const
export const AJNA_PROOF_GATE_PR_ID = 'PR-CM-TEST-10' as const
export const AJNA_PROOF_GATE_PHASE_ID = 'SYMBOLWRIGHT-TEST-10' as const

// Inline status unions — structurally compatible with proof modules on feature branches.
// These will remain valid after those PRs merge to main.
type KernelTraceStatus =
  | 'TRACE_PROOF_READY'
  | 'TRACE_PROOF_PARTIAL'
  | 'TRACE_PROOF_BLOCKED'
  | 'TRACE_PROOF_INVALID'

type AjnaMatrixStatus =
  | 'AJNA_PROOF_READY'
  | 'AJNA_PROOF_PARTIAL'
  | 'AJNA_PROOF_BLOCKED'
  | 'AJNA_PROOF_INVALID'

type RepoContextStatus =
  | 'REPO_CONTEXT_PROOF_READY'
  | 'REPO_CONTEXT_PROOF_PARTIAL'
  | 'REPO_CONTEXT_PROOF_BLOCKED'
  | 'REPO_CONTEXT_PROOF_INVALID'

type GovernanceStatus =
  | 'GOVERNANCE_PROOF_READY'
  | 'GOVERNANCE_PROOF_PARTIAL'
  | 'GOVERNANCE_PROOF_BLOCKED'
  | 'GOVERNANCE_PROOF_INVALID'

type RuntimeBoundaryStatus =
  | 'RUNTIME_BOUNDARY_PROOF_READY'
  | 'RUNTIME_BOUNDARY_PROOF_PARTIAL'
  | 'RUNTIME_BOUNDARY_PROOF_BLOCKED'
  | 'RUNTIME_BOUNDARY_PROOF_INVALID'

type GithubAdapterStatus =
  | 'GITHUB_ADAPTER_PROOF_READY'
  | 'GITHUB_ADAPTER_PROOF_PARTIAL'
  | 'GITHUB_ADAPTER_PROOF_BLOCKED'
  | 'GITHUB_ADAPTER_PROOF_INVALID'

export interface AjnaProofGateInput {
  readonly kernelTraceStatus?: KernelTraceStatus
  readonly ajnaMatrixStatus?: AjnaMatrixStatus
  readonly repoContextStatus?: RepoContextStatus
  readonly governanceStatus?: GovernanceStatus
  readonly runtimeBoundaryStatus?: RuntimeBoundaryStatus
  readonly githubAdapterStatus?: GithubAdapterStatus
}

export interface AjnaProofGateReport {
  readonly blockId: typeof AJNA_PROOF_GATE_BLOCK_ID
  readonly prId: typeof AJNA_PROOF_GATE_PR_ID
  readonly phaseId: typeof AJNA_PROOF_GATE_PHASE_ID
  readonly ajnaMayDeclareMergeReady: boolean
  readonly explanation: readonly string[]
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
}

interface DomainCheck {
  readonly label: string
  readonly status: string | undefined
  readonly readyValue: string
}

function checkDomain(check: DomainCheck): { pass: boolean; line: string } {
  if (check.status === undefined) {
    return { pass: false, line: `  ${check.label}: MISSING` }
  }
  const pass = check.status === check.readyValue
  const mark = pass ? 'PASS' : 'FAIL'
  return { pass, line: `  ${check.label}: ${check.status} [${mark}]` }
}

export function buildAjnaProofGateReport(input: AjnaProofGateInput): AjnaProofGateReport {
  const checks: DomainCheck[] = [
    {
      label: 'kernelTrace',
      status: input.kernelTraceStatus,
      readyValue: 'TRACE_PROOF_READY',
    },
    {
      label: 'ajnaMatrix',
      status: input.ajnaMatrixStatus,
      readyValue: 'AJNA_PROOF_READY',
    },
    {
      label: 'repoContext',
      status: input.repoContextStatus,
      readyValue: 'REPO_CONTEXT_PROOF_READY',
    },
    {
      label: 'governance',
      status: input.governanceStatus,
      readyValue: 'GOVERNANCE_PROOF_READY',
    },
    {
      label: 'runtimeBoundary',
      status: input.runtimeBoundaryStatus,
      readyValue: 'RUNTIME_BOUNDARY_PROOF_READY',
    },
    {
      label: 'githubAdapter',
      status: input.githubAdapterStatus,
      readyValue: 'GITHUB_ADAPTER_PROOF_READY',
    },
  ]

  const results = checks.map(checkDomain)
  const allPass = results.every((r) => r.pass)

  const explanation: string[] = [
    'Proof domain status:',
    ...results.map((r) => r.line),
    '',
    allPass
      ? 'All proofs READY — merge gate is open.'
      : 'One or more proofs not READY — merge gate is closed.',
  ]

  return {
    blockId: AJNA_PROOF_GATE_BLOCK_ID,
    prId: AJNA_PROOF_GATE_PR_ID,
    phaseId: AJNA_PROOF_GATE_PHASE_ID,
    ajnaMayDeclareMergeReady: allPass,
    explanation,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
  }
}
