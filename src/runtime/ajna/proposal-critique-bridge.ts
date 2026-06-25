export interface AjnaProposalCritique {
  readonly verdict: 'READY' | 'NEEDS_WORK'
  readonly findings: readonly string[]
}

export function critiqueProposalText(proposalText: string): AjnaProposalCritique {
  const findings: string[] = []
  const lowered = proposalText.toLowerCase()

  if (!lowered.includes('proposal')) {
    findings.push('Output should identify itself as a proposal.')
  }

  if (!lowered.includes('no patch is applied') && !lowered.includes('planning artifact')) {
    findings.push('Proposal should clearly state that no patch is applied.')
  }

  return {
    verdict: findings.length === 0 ? 'READY' : 'NEEDS_WORK',
    findings,
  }
}
