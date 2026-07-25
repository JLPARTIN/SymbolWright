export const SYMBOLWRIGHT_PROOF_HARNESS_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-01' as const
export const SYMBOLWRIGHT_PROOF_HARNESS_PR_ID = 'PR-CM-TEST-01' as const
export const SYMBOLWRIGHT_PROOF_HARNESS_PHASE_ID = 'SYMBOLWRIGHT-TEST-01' as const

export const SYMBOLWRIGHT_PROOF_HARNESS_DOMAINS = [
  'FOUNDATION',
  'AJNA_REVIEW_CORTEX',
  'REPO_CONTEXT',
  'GITHUB_ADAPTERS',
  'PERMISSIONS',
  'AGENT_KERNEL',
  'RUNTIME_BOUNDARY',
] as const
export type SymbolWrightProofHarnessDomain = (typeof SYMBOLWRIGHT_PROOF_HARNESS_DOMAINS)[number]

export const SYMBOLWRIGHT_PROOF_HARNESS_STATES = [
  'COVERED',
  'PARTIAL',
  'MISSING',
  'BLOCKED',
] as const
export type SymbolWrightProofHarnessState = (typeof SYMBOLWRIGHT_PROOF_HARNESS_STATES)[number]

export interface SymbolWrightProofHarnessDomainInput {
  readonly domain: SymbolWrightProofHarnessDomain
  readonly requiredSpecs: readonly string[]
  readonly existingSpecs: readonly string[]
  readonly blockingNotes?: readonly string[]
}

export interface SymbolWrightProofHarnessDomainReport {
  readonly domain: SymbolWrightProofHarnessDomain
  readonly state: SymbolWrightProofHarnessState
  readonly requiredSpecs: readonly string[]
  readonly existingSpecs: readonly string[]
  readonly missingSpecs: readonly string[]
  readonly blockingNotes: readonly string[]
}

export interface SymbolWrightProofHarnessReport {
  readonly blockId: typeof SYMBOLWRIGHT_PROOF_HARNESS_BLOCK_ID
  readonly prId: typeof SYMBOLWRIGHT_PROOF_HARNESS_PR_ID
  readonly phaseId: typeof SYMBOLWRIGHT_PROOF_HARNESS_PHASE_ID
  readonly testCommand: 'npm test'
  readonly typecheckCommand: 'npm run typecheck'
  readonly buildCommand: 'npm run build'
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
  readonly domains: readonly SymbolWrightProofHarnessDomainReport[]
  readonly mergeReady: boolean
  readonly summary: string
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function resolveDomainState(
  input: SymbolWrightProofHarnessDomainInput,
): SymbolWrightProofHarnessState {
  if ((input.blockingNotes ?? []).length > 0) {
    return 'BLOCKED'
  }

  if (input.requiredSpecs.length === 0) {
    return 'MISSING'
  }

  const existingSpecs = new Set(input.existingSpecs)
  const coveredCount = input.requiredSpecs.filter((spec) => existingSpecs.has(spec)).length

  if (coveredCount === input.requiredSpecs.length) {
    return 'COVERED'
  }

  if (coveredCount > 0) {
    return 'PARTIAL'
  }

  return 'MISSING'
}

export function buildSymbolWrightProofHarnessReport(
  inputs: readonly SymbolWrightProofHarnessDomainInput[],
): SymbolWrightProofHarnessReport {
  const domains = inputs.map((input): SymbolWrightProofHarnessDomainReport => {
    const requiredSpecs = uniqueSorted(input.requiredSpecs)
    const existingSpecs = uniqueSorted(input.existingSpecs)
    const existingSpecSet = new Set(existingSpecs)
    const missingSpecs = requiredSpecs.filter((spec) => !existingSpecSet.has(spec))
    const blockingNotes = uniqueSorted(input.blockingNotes ?? [])

    return {
      domain: input.domain,
      state: resolveDomainState({
        ...input,
        requiredSpecs,
        existingSpecs,
        blockingNotes,
      }),
      requiredSpecs,
      existingSpecs,
      missingSpecs,
      blockingNotes,
    }
  })

  const mergeReady = domains.length > 0 && domains.every((domain) => domain.state === 'COVERED')
  const coveredCount = domains.filter((domain) => domain.state === 'COVERED').length

  return {
    blockId: SYMBOLWRIGHT_PROOF_HARNESS_BLOCK_ID,
    prId: SYMBOLWRIGHT_PROOF_HARNESS_PR_ID,
    phaseId: SYMBOLWRIGHT_PROOF_HARNESS_PHASE_ID,
    testCommand: 'npm test',
    typecheckCommand: 'npm run typecheck',
    buildCommand: 'npm run build',
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
    domains,
    mergeReady,
    summary: `${coveredCount}/${domains.length} proof domains covered.`,
  }
}
